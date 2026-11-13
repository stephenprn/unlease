package com.stephenprn.contacts.mirror

import android.Manifest
import android.accounts.Account
import android.content.ContentProviderOperation
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Event
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.Photo
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.CommonDataKinds.StructuredPostal
import android.provider.ContactsContract.Data
import android.provider.ContactsContract.RawContacts
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.contacts.BuildConfig
import com.stephenprn.contacts.R
import com.stephenprn.unlease.mirror.MirrorAccount
import com.stephenprn.unlease.specs.NativePhoneMirrorSpec
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.max
import org.json.JSONArray
import org.json.JSONObject

/**
 * Contacts' people copied into the phone's own address book, one way, under the app's account
 * (`MirrorAccount`), as JavaScript plans them (`@unlease/contacts/services/phoneMirror`,
 * `mobile/contacts/src/app/phoneMirror.ts`). A person is a raw contact of that account: `SOURCE_ID`
 * its id, `SYNC1` the fingerprint of what was written, `SYNC2` the photo's blob. Written again, its
 * rows are replaced (its photo kept until the photo itself changes). Every row carries « Ouvrir dans
 * Contacts » (`MIME_PROFILE`, `res/xml/mirror_contacts.xml`), which opens the person in the app
 * (`ContactOpenActivity`). The account's rows are read-only for the phone's other apps: its sync
 * adapter uploads nothing and declares no edit schema.
 *
 * Every query and write names the account's type: the phone's other contacts are never read.
 */
class PhoneMirrorModule(private val reactContext: ReactApplicationContext) : NativePhoneMirrorSpec(reactContext) {

  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "phone-mirror").apply { isDaemon = true } }

  private fun background(promise: Promise, work: () -> Any?) {
    io.execute {
      try {
        promise.resolve(work())
      } catch (error: Exception) {
        promise.reject("phone_mirror", error.message ?: error.javaClass.simpleName, error)
      }
    }
  }

  private fun permitted(): Boolean =
      listOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS).all {
        ContextCompat.checkSelfPermission(reactContext, it) == PackageManager.PERMISSION_GRANTED
      }

  private val type: String
    get() = MirrorAccount.type(reactContext)

  private fun syncUri(uri: Uri, account: Account): Uri =
      MirrorAccount.asSyncAdapter(uri, account, ContactsContract.CALLER_IS_SYNCADAPTER, RawContacts.ACCOUNT_NAME, RawContacts.ACCOUNT_TYPE)

  override fun isOn(promise: Promise) = background(promise) { MirrorAccount.find(reactContext) != null }

  override fun turnOn(accountName: String, promise: Promise) = background(promise) {
    if (!permitted()) return@background false
    val account = MirrorAccount.ensure(reactContext, accountName, ContactsContract.AUTHORITY) ?: return@background false
    // The account's people show in the phone's lists though they belong to no group.
    val settings = ContentValues().apply {
      put(ContactsContract.Settings.ACCOUNT_NAME, account.name)
      put(ContactsContract.Settings.ACCOUNT_TYPE, account.type)
      put(ContactsContract.Settings.UNGROUPED_VISIBLE, 1)
      put(ContactsContract.Settings.SHOULD_SYNC, 0)
    }
    val resolver = reactContext.contentResolver
    val uri = syncUri(ContactsContract.Settings.CONTENT_URI, account)
    val selection = "${ContactsContract.Settings.ACCOUNT_NAME}=? AND ${ContactsContract.Settings.ACCOUNT_TYPE}=?"
    if (resolver.update(uri, settings, selection, arrayOf(account.name, account.type)) == 0) resolver.insert(uri, settings)
    true
  }

  override fun turnOff(promise: Promise) = background(promise) {
    val account = MirrorAccount.find(reactContext)
    if (account != null && permitted()) {
      // Removing the account drops its rows too; done first, so none outlives a removal that fails.
      reactContext.contentResolver.delete(syncUri(RawContacts.CONTENT_URI, account), "${RawContacts.ACCOUNT_TYPE}=?", arrayOf(type))
    }
    MirrorAccount.remove(reactContext)
  }

  /** The account's people: `{ contacts: [{ id, fingerprint, photo }] }`. */
  override fun written(promise: Promise) = background(promise) {
    val out = JSONArray()
    if (permitted()) {
      reactContext.contentResolver.query(
          RawContacts.CONTENT_URI,
          arrayOf(RawContacts.SOURCE_ID, RawContacts.SYNC1, RawContacts.SYNC2),
          "${RawContacts.ACCOUNT_TYPE}=? AND ${RawContacts.DELETED}=0",
          arrayOf(type),
          null,
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getString(0) ?: continue
          out.put(JSONObject().put("id", id).put("fingerprint", cursor.getString(1) ?: "").put("photo", cursor.getString(2) ?: ""))
        }
      }
    }
    JSONObject().put("contacts", out).toString()
  }

  /** `{ upserts: [MirroredContact], deletes: [id], photos: [{ id, photoId, uri, headers }] }`; resolves with the rows changed. */
  override fun apply(batch: String, promise: Promise) = background(promise) {
    if (!permitted()) return@background 0.0
    val account = MirrorAccount.find(reactContext) ?: return@background 0.0
    val json = JSONObject(batch)
    val rows = rawIds(account)
    var changed = 0
    val deletes = json.optJSONArray("deletes") ?: JSONArray()
    for (index in 0 until deletes.length()) {
      val rawId = rows[deletes.getString(index)] ?: continue
      for (id in rawId) {
        changed += reactContext.contentResolver.delete(syncUri(RawContacts.CONTENT_URI, account), "${RawContacts._ID}=? AND ${RawContacts.ACCOUNT_TYPE}=?", arrayOf(id.toString(), type))
      }
    }
    changed += upsert(account, rows, json.optJSONArray("upserts") ?: JSONArray())
    changed += photos(account, json.optJSONArray("photos") ?: JSONArray())
    changed.toDouble()
  }

  /** The account's raw contacts by person: `SOURCE_ID` to `_ID`s (two, after a run cut short). */
  private fun rawIds(account: Account): Map<String, List<Long>> {
    val out = HashMap<String, MutableList<Long>>()
    reactContext.contentResolver.query(
        RawContacts.CONTENT_URI,
        arrayOf(RawContacts._ID, RawContacts.SOURCE_ID),
        "${RawContacts.ACCOUNT_TYPE}=? AND ${RawContacts.ACCOUNT_NAME}=? AND ${RawContacts.DELETED}=0",
        arrayOf(account.type, account.name),
        null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val source = cursor.getString(1) ?: continue
        out.getOrPut(source) { mutableListOf() } += cursor.getLong(0)
      }
    }
    return out
  }

  private fun upsert(account: Account, rows: Map<String, List<Long>>, upserts: JSONArray): Int {
    val resolver = reactContext.contentResolver
    val ops = ArrayList<ContentProviderOperation>()
    var written = 0
    val flush = {
      if (ops.isNotEmpty()) {
        resolver.applyBatch(ContactsContract.AUTHORITY, ops)
        ops.clear()
      }
    }
    val dataUri = syncUri(Data.CONTENT_URI, account)
    val rawUri = syncUri(RawContacts.CONTENT_URI, account)
    for (index in 0 until upserts.length()) {
      val person = upserts.getJSONObject(index)
      val id = person.getString("id")
      val existing = rows[id]?.firstOrNull()
      val start = ops.size
      val data = mutableListOf<ContentValues>()
      rowsOf(person, id, data)
      if (existing != null) {
        ops += ContentProviderOperation.newUpdate(rawUri)
            .withSelection("${RawContacts._ID}=?", arrayOf(existing.toString()))
            .withValue(RawContacts.SYNC1, person.getString("fingerprint"))
            .withValue(RawContacts.STARRED, if (person.optBoolean("starred")) 1 else 0)
            .build()
        // Its rows replaced, its photo kept (the photo changes apart).
        ops += ContentProviderOperation.newDelete(dataUri)
            .withSelection("${Data.RAW_CONTACT_ID}=? AND ${Data.MIMETYPE}<>?", arrayOf(existing.toString(), Photo.CONTENT_ITEM_TYPE))
            .build()
        for (values in data) ops += ContentProviderOperation.newInsert(dataUri).withValues(values).withValue(Data.RAW_CONTACT_ID, existing).build()
      } else {
        ops += ContentProviderOperation.newInsert(rawUri)
            .withValue(RawContacts.ACCOUNT_NAME, account.name)
            .withValue(RawContacts.ACCOUNT_TYPE, account.type)
            .withValue(RawContacts.SOURCE_ID, id)
            .withValue(RawContacts.SYNC1, person.getString("fingerprint"))
            .withValue(RawContacts.SYNC2, "")
            .withValue(RawContacts.STARRED, if (person.optBoolean("starred")) 1 else 0)
            .build()
        for (values in data) ops += ContentProviderOperation.newInsert(dataUri).withValues(values).withValueBackReference(Data.RAW_CONTACT_ID, start).build()
      }
      written += 1
      // A person's operations stay in one batch (their back reference); a batch stays well under Android's limit.
      if (ops.size >= BATCH) flush()
    }
    flush()
    return written
  }

  /** A person's rows: name, organisation, numbers, emails, addresses, birthday, and the way back to the app. */
  private fun rowsOf(person: JSONObject, id: String, out: MutableList<ContentValues>) {
    val first = person.optString("firstName")
    val last = person.optString("lastName")
    if (first.isNotEmpty() || last.isNotEmpty()) {
      out += row(StructuredName.CONTENT_ITEM_TYPE) {
        put(StructuredName.GIVEN_NAME, first)
        put(StructuredName.FAMILY_NAME, last)
      }
    }
    val company = person.optString("company")
    val job = person.optString("jobTitle")
    if (company.isNotEmpty() || job.isNotEmpty()) {
      out += row(Organization.CONTENT_ITEM_TYPE) {
        put(Organization.COMPANY, company)
        put(Organization.TITLE, job)
        put(Organization.TYPE, Organization.TYPE_WORK)
      }
    }
    entries(person.optJSONArray("phones")) { entry ->
      out += row(Phone.CONTENT_ITEM_TYPE) {
        put(Phone.NUMBER, entry.optString("value"))
        kind(entry, PHONE_KINDS, Phone.TYPE, Phone.LABEL, Phone.TYPE_CUSTOM, Phone.TYPE_OTHER)
      }
    }
    entries(person.optJSONArray("emails")) { entry ->
      out += row(Email.CONTENT_ITEM_TYPE) {
        put(Email.ADDRESS, entry.optString("value"))
        kind(entry, PLACE_KINDS_EMAIL, Email.TYPE, Email.LABEL, Email.TYPE_CUSTOM, Email.TYPE_OTHER)
      }
    }
    entries(person.optJSONArray("addresses")) { entry ->
      out += row(StructuredPostal.CONTENT_ITEM_TYPE) {
        put(StructuredPostal.STREET, entry.optString("street"))
        put(StructuredPostal.POSTCODE, entry.optString("postalCode"))
        put(StructuredPostal.CITY, entry.optString("city"))
        put(StructuredPostal.REGION, entry.optString("region"))
        put(StructuredPostal.COUNTRY, entry.optString("country"))
        kind(entry, PLACE_KINDS_POSTAL, StructuredPostal.TYPE, StructuredPostal.LABEL, StructuredPostal.TYPE_CUSTOM, StructuredPostal.TYPE_OTHER)
      }
    }
    val birthday = person.optString("birthday").takeIf { it.isNotEmpty() && it != "null" }
    if (birthday != null) {
      out += row(Event.CONTENT_ITEM_TYPE) {
        put(Event.START_DATE, birthday)
        put(Event.TYPE, Event.TYPE_BIRTHDAY)
      }
    }
    val appName = reactContext.getString(R.string.app_name)
    out += row(MIME_PROFILE) {
      put(Data.DATA1, id)
      put(Data.DATA2, appName)
      put(Data.DATA3, reactContext.getString(R.string.mirror_open, appName))
    }
  }

  private fun row(mime: String, fill: ContentValues.() -> Unit): ContentValues = ContentValues().apply {
    put(Data.MIMETYPE, mime)
    fill()
  }

  private fun entries(list: JSONArray?, each: (JSONObject) -> Unit) {
    if (list == null) return
    for (index in 0 until list.length()) each(list.getJSONObject(index))
  }

  private fun ContentValues.kind(entry: JSONObject, kinds: Map<String, Int>, typeColumn: String, labelColumn: String, custom: Int, other: Int) {
    val kind = entry.optString("kind")
    if (kind == "custom") {
      put(typeColumn, custom)
      put(labelColumn, entry.optString("label"))
    } else {
      put(typeColumn, kinds[kind] ?: other)
    }
  }

  /** The photos: each read from this phone's file or the server's copy, made a square JPEG, written on its person. */
  private fun photos(account: Account, photos: JSONArray): Int {
    if (photos.length() == 0) return 0
    val resolver = reactContext.contentResolver
    val rows = rawIds(account)
    val dataUri = syncUri(Data.CONTENT_URI, account)
    val rawUri = syncUri(RawContacts.CONTENT_URI, account)
    var written = 0
    for (index in 0 until photos.length()) {
      val photo = photos.getJSONObject(index)
      val rawId = rows[photo.getString("id")]?.firstOrNull() ?: continue
      val photoId = photo.optString("photoId")
      val bytes = if (photoId.isEmpty()) null else (load(photo.optString("uri"), photo.optJSONObject("headers")) ?: continue)
      resolver.delete(dataUri, "${Data.RAW_CONTACT_ID}=? AND ${Data.MIMETYPE}=?", arrayOf(rawId.toString(), Photo.CONTENT_ITEM_TYPE))
      if (bytes != null) {
        resolver.insert(dataUri, ContentValues().apply {
          put(Data.RAW_CONTACT_ID, rawId)
          put(Data.MIMETYPE, Photo.CONTENT_ITEM_TYPE)
          put(Photo.PHOTO, bytes)
        })
      }
      resolver.update(rawUri, ContentValues().apply { put(RawContacts.SYNC2, photoId) }, "${RawContacts._ID}=?", arrayOf(rawId.toString()))
      written += 1
    }
    return written
  }

  /** A picture's bytes as the address book keeps them: a JPEG at most `PHOTO_PX` wide; null when it cannot be read now. */
  private fun load(address: String, headers: JSONObject?): ByteArray? = try {
    val raw: ByteArray? =
        if (address.startsWith("file://")) File(Uri.parse(address).path ?: "").takeIf { it.isFile && it.length() <= MAX_BYTES }?.readBytes()
        else if (address.startsWith("https://") || address.startsWith("http://")) download(address, headers)
        else null
    raw?.let { shrink(it) }
  } catch (_: Exception) {
    null
  }

  private fun download(address: String, headers: JSONObject?): ByteArray? {
    val connection = URL(address).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 10_000
      connection.readTimeout = 20_000
      headers?.keys()?.forEach { key -> connection.setRequestProperty(key, headers.getString(key)) }
      if (connection.responseCode != 200 || connection.contentLengthLong > MAX_BYTES) return null
      return connection.inputStream.use { it.readBytes() }.takeIf { it.size <= MAX_BYTES }
    } finally {
      connection.disconnect()
    }
  }

  private fun shrink(bytes: ByteArray): ByteArray? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= PHOTO_PX) sample *= 2
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val scale = PHOTO_PX.toFloat() / max(decoded.width, decoded.height)
    val picture = if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt().coerceAtLeast(1), (decoded.height * scale).toInt().coerceAtLeast(1), true) else decoded
    return ByteArrayOutputStream().use { out ->
      picture.compress(Bitmap.CompressFormat.JPEG, 88, out)
      out.toByteArray()
    }
  }

  companion object {
    /** The row that opens the person in the app; `vnd.unlease.dev.contact` in a dev build (dev-builds.gradle rewrites `mirror_contacts.xml` to match). */
    val MIME_PROFILE = "vnd.android.cursor.item/vnd.unlease${if (BuildConfig.SCHEME_SUFFIX.isEmpty()) "" else ".dev"}.contact"

    private const val BATCH = 300
    private const val PHOTO_PX = 720
    private const val MAX_BYTES = 20L * 1024 * 1024

    private val PHONE_KINDS = mapOf("mobile" to Phone.TYPE_MOBILE, "home" to Phone.TYPE_HOME, "work" to Phone.TYPE_WORK, "main" to Phone.TYPE_MAIN, "other" to Phone.TYPE_OTHER)
    private val PLACE_KINDS_EMAIL = mapOf("home" to Email.TYPE_HOME, "work" to Email.TYPE_WORK, "other" to Email.TYPE_OTHER)
    private val PLACE_KINDS_POSTAL = mapOf("home" to StructuredPostal.TYPE_HOME, "work" to StructuredPostal.TYPE_WORK, "other" to StructuredPostal.TYPE_OTHER)

    /** Whether a profile row at this address belongs to this app's account: the contact id it holds, or null. */
    fun contactIdOf(context: Context, data: Uri): String? {
      context.contentResolver.query(
          data,
          arrayOf(Data.DATA1, Data.MIMETYPE, RawContacts.ACCOUNT_TYPE),
          null, null, null,
      )?.use { cursor ->
        if (!cursor.moveToFirst()) return null
        if (cursor.getString(1) != MIME_PROFILE || cursor.getString(2) != MirrorAccount.type(context)) return null
        return cursor.getString(0)
      }
      return null
    }
  }
}
