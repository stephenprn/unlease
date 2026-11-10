package com.stephenprn.contacts.phone

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Event
import android.provider.ContactsContract.CommonDataKinds.GroupMembership
import android.provider.ContactsContract.CommonDataKinds.Note
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.CommonDataKinds.StructuredPostal
import android.util.Base64
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.stephenprn.contacts.R
import com.stephenprn.unlease.media.ImageImporter
import com.stephenprn.unlease.specs.NativePhoneContactsSpec
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone's own address book, read for an import (`readContacts`, a page at a time: an address
 * book of thousands stays responsive), WhatsApp's call rows, calls, pictures and a shared card. Every
 * read runs on its own thread; without READ_CONTACTS a read comes back empty, never throws.
 */
class PhoneContactsModule(private val reactContext: ReactApplicationContext) : NativePhoneContactsSpec(reactContext) {

  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "phone-contacts").apply { isDaemon = true } }

  private fun canRead(): Boolean =
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

  private fun background(promise: Promise, work: () -> Any?) {
    io.execute {
      try {
        promise.resolve(work())
      } catch (error: Exception) {
        promise.reject("phone_contacts", error.message ?: error.javaClass.simpleName, error)
      }
    }
  }

  // ── the address book ──────────────────────────────────────────────────────

  override fun readContacts(offset: Double, limit: Double, promise: Promise) = background(promise) {
    if (!canRead()) return@background JSONObject().put("total", 0).put("contacts", JSONArray()).toString()
    val resolver = reactContext.contentResolver
    // Every contact, in creation order: its id, whether it is starred, its photo.
    val heads = mutableListOf<Triple<Long, Boolean, String>>()
    resolver.query(
        ContactsContract.Contacts.CONTENT_URI,
        arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.STARRED, ContactsContract.Contacts.PHOTO_URI),
        null, null, "${ContactsContract.Contacts._ID} ASC",
    )?.use { cursor ->
      while (cursor.moveToNext()) heads += Triple(cursor.getLong(0), cursor.getInt(1) == 1, cursor.getString(2) ?: "")
    }
    val from = offset.toInt().coerceIn(0, heads.size)
    val page = heads.subList(from, (from + limit.toInt().coerceAtLeast(0)).coerceAtMost(heads.size))
    val groups = groupTitles()
    val people = LinkedHashMap<Long, Person>()
    for ((id, starred, photo) in page) people[id] = Person(starred, photo)
    if (people.isNotEmpty()) {
      val ids = people.keys.joinToString(",")
      resolver.query(
          ContactsContract.Data.CONTENT_URI,
          arrayOf(ContactsContract.Data.CONTACT_ID, ContactsContract.Data.MIMETYPE, "data1", "data2", "data3", "data4", "data5", "data6", "data7", "data8", "data9", "data10"),
          "${ContactsContract.Data.CONTACT_ID} IN ($ids)", null, "${ContactsContract.Data.CONTACT_ID} ASC, ${ContactsContract.Data.IS_SUPER_PRIMARY} DESC, ${ContactsContract.Data.IS_PRIMARY} DESC",
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          val person = people[cursor.getLong(0)] ?: continue
          val data = (0..9).map { cursor.getString(2 + it) ?: "" }
          person.read(cursor.getString(1) ?: "", data, groups)
        }
      }
    }
    val list = JSONArray()
    for (person in people.values) list.put(person.toJson())
    JSONObject().put("total", heads.size).put("contacts", list).toString()
  }

  /** The person's own groups (Google's labels), by row id; the system's (« My Contacts », « Starred ») are not labels. */
  private fun groupTitles(): Map<Long, String> {
    val titles = HashMap<Long, String>()
    reactContext.contentResolver.query(
        ContactsContract.Groups.CONTENT_URI,
        arrayOf(ContactsContract.Groups._ID, ContactsContract.Groups.TITLE, ContactsContract.Groups.SYSTEM_ID, ContactsContract.Groups.DELETED),
        null, null, null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val title = cursor.getString(1)?.trim() ?: continue
        if (title.isEmpty() || !cursor.isNull(2) || cursor.getInt(3) == 1) continue
        titles[cursor.getLong(0)] = title
      }
    }
    return titles
  }

  /** One phone contact, its raw contacts' rows gathered (a contact linked from two accounts has each row twice). */
  private class Person(val starred: Boolean, val photo: String) {
    var firstName = ""
    var lastName = ""
    var company = ""
    var jobTitle = ""
    val notes = mutableListOf<String>()
    var birthday = ""
    val phones = mutableListOf<JSONObject>()
    val emails = mutableListOf<JSONObject>()
    val addresses = mutableListOf<JSONObject>()
    val labels = linkedSetOf<String>()
    private val seen = HashSet<String>()

    fun read(mime: String, d: List<String>, groups: Map<Long, String>) {
      when (mime) {
        StructuredName.CONTENT_ITEM_TYPE ->
          if (firstName.isEmpty() && lastName.isEmpty()) {
            firstName = listOf(d[1], d[4]).filter { it.isNotBlank() }.joinToString(" ").trim()
            lastName = d[2].trim()
            // Only a display name (a number saved as « Plombier »): it is the first name.
            if (firstName.isEmpty() && lastName.isEmpty()) firstName = d[0].trim()
          }
        Phone.CONTENT_ITEM_TYPE -> {
          val number = d[0].trim()
          if (number.isNotEmpty() && seen.add("tel:" + number.filter { it.isDigit() })) phones += entry(number, phoneKind(d[1].toIntOrNull()), if (d[1] == Phone.TYPE_CUSTOM.toString()) d[2] else "")
        }
        Email.CONTENT_ITEM_TYPE -> {
          val address = d[0].trim()
          if (address.isNotEmpty() && seen.add("mail:" + address.lowercase())) emails += entry(address, placeKind(d[1].toIntOrNull(), Email.TYPE_HOME, Email.TYPE_WORK), if (d[1] == Email.TYPE_CUSTOM.toString()) d[2] else "")
        }
        StructuredPostal.CONTENT_ITEM_TYPE -> {
          val street = listOf(d[3], d[4]).filter { it.isNotBlank() }.joinToString("\n")
          val structured = listOf(street, d[6], d[7], d[8], d[9]).any { it.isNotBlank() }
          val address = JSONObject()
              .put("kind", placeKind(d[1].toIntOrNull(), StructuredPostal.TYPE_HOME, StructuredPostal.TYPE_WORK))
              .put("label", if (d[1] == StructuredPostal.TYPE_CUSTOM.toString()) d[2] else "")
              .put("street", if (structured) street else d[0])
              .put("postalCode", d[8])
              .put("city", d[6])
              .put("region", d[7])
              .put("country", d[9])
          if (seen.add("adr:" + address.toString())) addresses += address
        }
        Event.CONTENT_ITEM_TYPE -> if (d[1] == Event.TYPE_BIRTHDAY.toString() && birthday.isEmpty()) birthday = d[0].trim()
        Organization.CONTENT_ITEM_TYPE ->
          if (company.isEmpty() && jobTitle.isEmpty()) {
            company = d[0].trim()
            jobTitle = d[3].trim()
          }
        Note.CONTENT_ITEM_TYPE -> if (d[0].isNotBlank() && d[0].trim() !in notes) notes += d[0].trim()
        GroupMembership.CONTENT_ITEM_TYPE -> d[0].toLongOrNull()?.let { groups[it] }?.let { labels += it }
      }
    }

    private fun entry(value: String, kind: String, label: String): JSONObject = JSONObject().put("value", value).put("kind", kind).put("label", label.trim())

    fun toJson(): JSONObject =
        JSONObject()
            .put("firstName", firstName)
            .put("lastName", lastName)
            .put("company", company)
            .put("jobTitle", jobTitle)
            .put("note", notes.joinToString("\n\n"))
            .put("birthday", birthday)
            .put("favorite", starred)
            .put("photo", photo)
            .put("phones", JSONArray(phones))
            .put("emails", JSONArray(emails))
            .put("addresses", JSONArray(addresses))
            .put("labels", JSONArray(labels.toList()))
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  override fun whatsappInstalled(promise: Promise) {
    promise.resolve(WHATSAPP_PACKAGES.any { installed(it) })
  }

  private fun installed(name: String): Boolean =
      try {
        reactContext.packageManager.getPackageInfo(name, 0)
        true
      } catch (_: PackageManager.NameNotFoundException) {
        false
      }

  /**
   * WhatsApp writes a voice and a video row into the contacts provider for each number it knows
   * (`data1`: `33612345678@s.whatsapp.net`); a number is matched by its last nine digits, which
   * leave out the country and the trunk prefix.
   */
  override fun whatsappCalls(number: String, promise: Promise) = background(promise) {
    val found = Arguments.createMap().apply {
      putString("voice", "")
      putString("video", "")
    }
    val digits = number.filter { it.isDigit() }
    if (!canRead() || digits.length < 6) return@background found
    val key = digits.takeLast(9)
    reactContext.contentResolver.query(
        ContactsContract.Data.CONTENT_URI,
        arrayOf(ContactsContract.Data._ID, ContactsContract.Data.MIMETYPE),
        "${ContactsContract.Data.MIMETYPE} IN (?, ?) AND data1 LIKE ?",
        arrayOf(WHATSAPP_VOICE, WHATSAPP_VIDEO, "%$key@%"),
        null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val uri = ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, cursor.getLong(0)).toString()
        val slot = if (cursor.getString(1) == WHATSAPP_VIDEO) "video" else "voice"
        if (found.getString(slot).isNullOrEmpty()) found.putString(slot, uri)
      }
    }
    found
  }

  override fun openWhatsappCall(uri: String, video: Boolean, promise: Promise) {
    val mime = if (video) WHATSAPP_VIDEO else WHATSAPP_VOICE
    val target = WHATSAPP_PACKAGES.firstOrNull { installed(it) }
    if (target == null) {
      promise.resolve(false)
      return
    }
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime).setPackage(target).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    promise.resolve(start(intent))
  }

  // ── calls ─────────────────────────────────────────────────────────────────

  override fun placeCall(number: String, promise: Promise) {
    promise.resolve(Calls.place(reactContext.currentActivity ?: reactContext, number))
  }

  // ── pictures ──────────────────────────────────────────────────────────────

  override fun importPhoto(uri: String, promise: Promise) = background(promise) {
    photoMap(ImageImporter.import(reactContext, Uri.parse(uri)))
  }

  override fun importPhotoData(base64: String, promise: Promise) = background(promise) {
    val bytes = Base64.decode(base64, Base64.DEFAULT)
    val dir = File(reactContext.cacheDir, "photo-in").apply { mkdirs() }
    val raw = File(dir, UUID.randomUUID().toString())
    try {
      raw.writeBytes(bytes)
      photoMap(ImageImporter.import(reactContext, Uri.fromFile(raw)))
    } finally {
      raw.delete()
    }
  }

  private fun photoMap(image: com.stephenprn.unlease.media.ImportedImage?): WritableMap =
      Arguments.createMap().apply {
        putString("path", image?.path ?: "")
        putString("mime", image?.mime ?: "")
      }

  // ── sharing a card ────────────────────────────────────────────────────────

  override fun shareText(fileName: String, mime: String, text: String, promise: Promise) = background(promise) {
    val safe = fileName.replace(Regex("[^\\p{L}\\p{N} ._-]"), "_").take(80).ifBlank { "contact.vcf" }
    val dir = File(reactContext.cacheDir, "shared/${UUID.randomUUID()}").apply { mkdirs() }
    val file = File(dir, safe)
    file.writeText(text)
    val uri = FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.files", file)
    val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    val chooser = Intent.createChooser(send, reactContext.getString(R.string.share_contact)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    start(chooser)
  }

  private fun start(intent: Intent): Boolean =
      try {
        (reactContext.currentActivity ?: reactContext).startActivity(intent)
        true
      } catch (_: ActivityNotFoundException) {
        false
      } catch (_: SecurityException) {
        false
      }

  override fun invalidate() {
    io.shutdown()
    super.invalidate()
  }

  companion object {
    private const val WHATSAPP_VOICE = "vnd.android.cursor.item/vnd.com.whatsapp.voip.call"
    private const val WHATSAPP_VIDEO = "vnd.android.cursor.item/vnd.com.whatsapp.video.call"
    private val WHATSAPP_PACKAGES = listOf("com.whatsapp", "com.whatsapp.w4b")

    private fun phoneKind(type: Int?): String =
        when (type) {
          Phone.TYPE_MOBILE -> "mobile"
          Phone.TYPE_HOME, Phone.TYPE_FAX_HOME -> "home"
          Phone.TYPE_WORK, Phone.TYPE_WORK_MOBILE, Phone.TYPE_FAX_WORK, Phone.TYPE_WORK_PAGER, Phone.TYPE_COMPANY_MAIN -> "work"
          Phone.TYPE_MAIN -> "main"
          else -> "other"
        }

    private fun placeKind(type: Int?, home: Int, work: Int): String =
        when (type) {
          home -> "home"
          work -> "work"
          else -> "other"
        }
  }
}
