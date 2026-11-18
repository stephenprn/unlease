import { cleanMrzLine, findMrz, mrzCheckDigit, readMrz } from '../mrz';

const NOW = Date.UTC(2026, 10, 18);

describe('MRZ', () => {
  it('computes ICAO’s check digit', () => {
    expect(mrzCheckDigit('L898902C3')).toBe(6);
    expect(mrzCheckDigit('740812')).toBe(2);
    expect(mrzCheckDigit('120415')).toBe(9);
  });

  it('reads ICAO’s passport specimen (TD3)', () => {
    const reading = readMrz(['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'], NOW)!;
    expect(reading).toMatchObject({
      format: 'td3',
      kind: 'passport',
      issuingState: 'UTO',
      number: 'L898902C3',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      nationality: 'UTO',
      birthDate: '1974-08-12',
      sex: 'F',
      expiresOn: '2012-04-15',
      checked: true,
    });
  });

  it('reads ICAO’s identity card specimen (TD1)', () => {
    const reading = readMrz(['I<UTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'], NOW)!;
    expect(reading).toMatchObject({ format: 'td1', kind: 'idCard', number: 'D23145890', surname: 'ERIKSSON', givenNames: 'ANNA MARIA', birthDate: '1974-08-12', expiresOn: '2012-04-15', checked: true });
  });

  it('reads ICAO’s TD2 specimen', () => {
    const reading = readMrz(['I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<', 'D231458907UTO7408122F1204159<<<<<<<6'], NOW)!;
    expect(reading).toMatchObject({ format: 'td2', number: 'D23145890', expiresOn: '2012-04-15', checked: true });
  });

  it('reads France’s identity card of before 2021, which gives no expiry', () => {
    const reading = readMrz(['IDFRABERTHIER<<<<<<<<<<<<<<<<<<<<<<<', '8806923102858CORINNE<<<<<<<6512068F6'], NOW)!;
    expect(reading).toMatchObject({
      format: 'frId',
      kind: 'idCard',
      number: '880692310285',
      surname: 'BERTHIER',
      givenNames: 'CORINNE',
      birthDate: '1965-12-06',
      sex: 'F',
      expiresOn: null,
      issuedOn: '1988-06-01',
      checked: true,
    });
  });

  it('marks a reading whose checks fail, so it is checked against the paper', () => {
    const reading = readMrz(['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C46UTO7408122F1204159ZE184226B<<<<<10'], NOW)!;
    expect(reading.checked).toBe(false);
  });

  it('finds the zone in recognized text, mended where only digits can stand', () => {
    const text = [
      'PASSPORT  PASSEPORT',
      'Surname ERIKSSON',
      'P<UTOERIKSSON<<ANNA<MARIA«<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO74O8122F12O4159ZE184226B<<<<< 10',
    ].join('\n');
    expect(findMrz(text, NOW)).toMatchObject({ number: 'L898902C3', birthDate: '1974-08-12', checked: true });
    expect(findMrz('nothing here', NOW)).toBeNull();
  });

  it('cleans what recognition makes of the fillers', () => {
    expect(cleanMrzLine('p<uto eriksson«anna')).toBe('P<UTOERIKSSON<ANNA');
  });
});
