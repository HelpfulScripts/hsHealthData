

/**

 */
export interface Observation {
    templateID: ID;
    id:         ID;
    code:       Code;
    text:       Text;
    statusCode: StatusCode;
    effectiveTime:  DateInterval;
}

export interface ID {
    root: string
}

/**
 *     <code code="8867-4" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="Heart rate"/>
 */
export interface Code {
    code:           string;
    codeSystem:     string;
    codeSystemName: 'LOINC';
    displayName:    'Heart rate';
}

/**
 *  <text>
        <sourceName>Hauke’s Apple Watch</sourceName>
        <sourceVersion>4.0</sourceVersion>
        <device>&lt;&lt;HKDevice: 0x281b34320&gt;, name:Apple Watch, manufacturer:Apple, model:Watch, hardware:Watch3,4, software:4.0&gt;</device>
        <value>77</value>
        <type>HKQuantityTypeIdentifierHeartRate</type>
        <unit>count/min</unit>
        <metadataEntry>
            <key>HKMetadataKeyHeartRateMotionContext</key>
            <value>1</value>
        </metadataEntry>
    </text>
 */
export interface Text {
    sourceName:     string;
    sourceVersion:  string;
    device:         string;
    value:          number;
    type:           'HKQuantityTypeIdentifierHeartRate';
    unit:           string;
    metadataEntry: {
        HKMetadataKeyHeartRateMotionContext: 0 | 1;
    }
}

export interface StatusCode {
    code:   'completed';
}

export interface DateInterval {
    low:    DateString;     
    high:   DateString;
}

export type DateString = string;    // "20171009191438-0700"