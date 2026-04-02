import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';

export async function nomalizeCustomerPhone(phone: string, countryCode: string = 'BJ') {

    const phoneUtil = PhoneNumberUtil.getInstance();
    // 1. Validation et Normalisation Google
    try {
        const numberProto = phoneUtil.parseAndKeepRawInput(phone, countryCode);
        // const numberProto = phoneUtil.parseAndKeepRawInput(phone);

        if (!phoneUtil.isValidNumber(numberProto)) {
            throw new Error("INVALID_FORMAT");
        }

        // On formate au standard international E.164 (ex: +22960606060)
        return phoneUtil.format(numberProto, PhoneNumberFormat.E164);
    } catch (error) {
        return "INVALID_PHONE";
    }
}