/**
<?xml version="1.0" encoding="UTF-8"?>
<!-- Note: Any Records that appear as children of a correlation also appear as top-level records in this document. -->
<!ELEMENT Correlation ((MetadataEntry|Record)*)>
<!ATTLIST Correlation
  type          CDATA #REQUIRED
  sourceName    CDATA #REQUIRED
  sourceVersion CDATA #IMPLIED
  device        CDATA #IMPLIED
  creationDate  CDATA #IMPLIED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
<!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute)*)>
<!ATTLIST Workout
  workoutActivityType   CDATA #REQUIRED
  duration              CDATA #IMPLIED
  durationUnit          CDATA #IMPLIED
  totalDistance         CDATA #IMPLIED
  totalDistanceUnit     CDATA #IMPLIED
  totalEnergyBurned     CDATA #IMPLIED
  totalEnergyBurnedUnit CDATA #IMPLIED
  sourceName            CDATA #REQUIRED
  sourceVersion         CDATA #IMPLIED
  device                CDATA #IMPLIED
  creationDate          CDATA #IMPLIED
  startDate             CDATA #REQUIRED
  endDate               CDATA #REQUIRED
>
<!ELEMENT WorkoutEvent EMPTY>
<!ATTLIST WorkoutEvent
  type         CDATA #REQUIRED
  date         CDATA #REQUIRED
  duration     CDATA #IMPLIED
  durationUnit CDATA #IMPLIED
>
<!ELEMENT WorkoutRoute ((MetadataEntry|FileReference)*)>
<!ATTLIST WorkoutRoute
  sourceName    CDATA #REQUIRED
  sourceVersion CDATA #IMPLIED
  device        CDATA #IMPLIED
  creationDate  CDATA #IMPLIED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
<!ELEMENT FileReference EMPTY>
<!ATTLIST FileReference
  path CDATA #REQUIRED
>
<!ELEMENT ActivitySummary EMPTY>
<!ATTLIST ActivitySummary
  dateComponents           CDATA #IMPLIED
  activeEnergyBurned       CDATA #IMPLIED
  activeEnergyBurnedGoal   CDATA #IMPLIED
  activeEnergyBurnedUnit   CDATA #IMPLIED
  appleMoveTime            CDATA #IMPLIED
  appleMoveTimeGoal        CDATA #IMPLIED
  appleExerciseTime        CDATA #IMPLIED
  appleExerciseTimeGoal    CDATA #IMPLIED
  appleStandHours          CDATA #IMPLIED
  appleStandHoursGoal      CDATA #IMPLIED
>
<!ELEMENT ClinicalRecord EMPTY>
<!ATTLIST ClinicalRecord
  type              CDATA #REQUIRED
  identifier        CDATA #REQUIRED
  sourceName        CDATA #REQUIRED
  sourceURL         CDATA #REQUIRED
  fhirVersion       CDATA #REQUIRED
  receivedDate      CDATA #REQUIRED
  resourceFilePath  CDATA #REQUIRED
>
<!ELEMENT Audiogram EMPTY>
<!ATTLIST Audiogram
  type          CDATA #REQUIRED
  sourceName    CDATA #REQUIRED
  sourceVersion CDATA #IMPLIED
  device        CDATA #IMPLIED
  creationDate  CDATA #IMPLIED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
<!ELEMENT SensitivityPoint EMPTY>
<!ATTLIST SensitivityPoint
  frequencyValue   CDATA #REQUIRED
  frequencyUnit    CDATA #REQUIRED
  leftEarValue     CDATA #IMPLIED
  leftEarUnit      CDATA #IMPLIED
  rightEarValue    CDATA #IMPLIED
  rightEarUnit     CDATA #IMPLIED
>
]>
*/

import { Log }      from 'hsnode'; const log = new Log('HealthKit');
import sax          from 'sax';
import { date }     from 'hsutil';

type StringMap =        {[name:string]:string};
type TransformerMap =   {[key:string]:Transformer|[string, Transformer]};

interface Transformer {
    (key:string, source:any): number | Date;
}
const toDate:Transformer    = (key:string, source:any) => source[key]? new Date(source[key]) : undefined;
const toNumber:Transformer  = (key:string, source:any) => source[key]? +source[key] : undefined;
const toHKCharType:Transformer  = (key:string, source:any) => {
    const hkKey = `HKCharacteristicTypeIdentifier${key[0].toUpperCase()}${key.slice(1)}`;
    return source[hkKey];
}


export abstract class HkNode {
    constructor() {}
    abstract add(node:sax.Tag):HkNode;
    close(p:HkNode) {}

    /**
     * 
     * @param fields e.g. `['field1', {field2:transformer, field3:[sourceName, transformer]}, ...]`
     * @param source e.g. `{value: 5, name:'Joe'}`
     */
    addRequired(fields:Array<string|TransformerMap>, source:StringMap, required=true) {
        fields.forEach(f => {
            if (typeof f === 'string') {
                if (required && source[f] === undefined) {
                    log.warn(`required '${f}' not present on ${this.constructor.name}\n${log.inspect(source)}`);
                } else {
                    this[f] = source[f];
                }
            } else {
                Object.keys(f).forEach(key => {
                    const fn = f[key];
                    const val = fn instanceof Array? fn[1](fn[0], source) : (<Transformer>fn)(key, source);
                    if (required && val === undefined) {
                        log.warn(`required '${key}' not present on ${this.constructor.name}\n${log.inspect(source)}`);
                    } else {
                        this[key] = val;
                    }
                })
            }
        })
    }

    addOptional(fields:Array<string|{[key:string]:Transformer}>, source:any) {
        this.addRequired(fields, source, false);
    }

    addOneOfMany(field:string, hkNode:HkNode):HkNode {
        this[field] = this[field] ?? [];
        this[field].push(hkNode);
        return hkNode;
    }
}

export class HkRoot extends HkNode {
    healthData:HkHealthData;

    constructor() {
        super();
    }
    add(node:sax.Tag):HkNode {
        if (node.name === 'HealthData') {
            return this.healthData = new HkHealthData(node);
        }
        throw `unkown node type ${node.name} in ${this.constructor.name}\n${log.inspect(node)}`;
    }
}

/**
<!DOCTYPE HealthData [
    <!-- HealthKit Export Version: 11 -->
    <!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord)*)>
    <!ATTLIST HealthData
        locale CDATA #REQUIRED
    >
 */
export class HkHealthData extends HkNode {
    locale:             string;
    exportDate:         Date;
    me:                 HkMe;
    record?:            HkRecord[];
    correlation?:       Correlation[];
    workout?:           Workout[];
    activitySummary?:   ActivitySummary[];
    clinicalRecord?:    ClinicalRecord[];
    constructor(node:sax.Tag) {
        super();
        this.addRequired(['locale'], node.attributes);
    }

    add(node:sax.Tag):HkNode {
        switch (node.name) {
            case 'ExportDate':  this.exportDate = new Date(node.attributes.value); 
                                return undefined;
            case 'Me':          return this.me = new HkMe(node);
            case 'Record':      return new HkRecord(node);
            default: throw `unkown node type ${node.name} in ${this.constructor.name}\n${log.inspect(node)}`;
        }
    }
}

/**
<!ELEMENT ExportDate EMPTY>
<!ATTLIST ExportDate
    value CDATA #REQUIRED
>
 */
export class HkExportDate extends HkNode {
    date: Date;
    constructor(node:sax.Tag) {
        super();
        this.addRequired([{date: ['value', toDate]}], node.attributes);
    }
    add(node:sax.Tag):HkNode {
        return undefined;
    }
}

/**
<!ELEMENT Me EMPTY>
<!ATTLIST Me
  HKCharacteristicTypeIdentifierDateOfBirth         CDATA #REQUIRED
  HKCharacteristicTypeIdentifierBiologicalSex       CDATA #REQUIRED
  HKCharacteristicTypeIdentifierBloodType           CDATA #REQUIRED
  HKCharacteristicTypeIdentifierFitzpatrickSkinType CDATA #REQUIRED
>
 */
export class HkMe extends HkNode {
    dateOfBirth: string;
    biologicalSex: string;
    bloodType: string;
    skinType: string;
    constructor(node:sax.Tag) {
        super();
        this.addRequired([{
            dateOfBirth:            toHKCharType, 
            biologicalSex:          toHKCharType, 
            bloodType:              toHKCharType,
            fitzpatrickSkinType:    toHKCharType
        }], node.attributes);
    }
    add(node:sax.Tag):HkNode {
        throw `unkown node type ${node.name} in ${this.constructor.name}\n${log.inspect(node)}`;
    }
}

/**
<!ELEMENT Record ((MetadataEntry|HeartRateVariabilityMetadataList)*)>
<!ATTLIST Record
  type          CDATA #REQUIRED
  unit          CDATA #IMPLIED
  value         CDATA #IMPLIED
  sourceName    CDATA #REQUIRED
  sourceVersion CDATA #IMPLIED
  device        CDATA #IMPLIED
  creationDate  CDATA #IMPLIED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
*/
class HkRecord extends HkNode {
    type: string;
    unit: string;
    value: number;
    sourceVersion: string;
    device: string;
    creationDate: Date;
    sourceName: string;
    startDate: Date;
    endDate: Date;
    metadata: MetadataEntry[];
    heartrate:  HeartRateVariabilityMetadataList[];
    constructor(node:sax.Tag) {
        super();
        this.addRequired(['type', 'sourceName', {startDate:toDate}, {endDate:toDate}], node.attributes);
        this.addOptional(['unit', {value:toNumber}, 'sourceVersion', 'device', {creationDate:toDate}], node.attributes);
    }
    add(node:sax.Tag):HkNode {
        switch (node.name) {
            /**
             * <!ELEMENT MetadataEntry EMPTY>
             * <!ATTLIST MetadataEntry
             *      key   CDATA #REQUIRED
             *      value CDATA #REQUIRED
             * >
             */
            case 'MetadataEntry':   
                this.metadata = this.metadata ?? [];
                this.metadata[node.attributes.key] = node.attributes.value;
                return undefined;
            /**
             * <!-- Note: Heart Rate Variability records captured by Apple Watch may include an associated list of instantaneous beats-per-minute readings. -->
             * <!ELEMENT HeartRateVariabilityMetadataList (InstantaneousBeatsPerMinute*)>
             * <!ELEMENT InstantaneousBeatsPerMinute EMPTY>
             * <!ATTLIST InstantaneousBeatsPerMinute
             *      bpm  CDATA #REQUIRED
             *      time CDATA #REQUIRED
             * >
             */
            case 'HeartRateVariabilityMetadataList': 
                this.heartrate = this.heartrate ?? [];
                this.heartrate[node.attributes.time] = node.attributes.bpm;
                return undefined;
            
            // case 'HKQuantityTypeIdentifierOxygenSaturation':
            //     return undefined;

            default: 
                log.warn(`unknown node name ${node.name} in ${this.constructor.name}`);
                log.warn(log.inspect(node));
                throw `unknown node type ${node.name} in ${this.constructor.name}`
       }
    }
    addToParent(field:string, key:string, parent:HkNode) {
        parent[field] = parent[field] ?? { unit: this.unit, device: this.sourceName, values:{}};
        parent[field].values[key] = this.value;
    }
    close(parent:HkNode) {
        switch( this.type) {
            case 'HKQuantityTypeIdentifierHeight': 
                this.addToParent('height', date('%YYYY%MM%DD', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierBodyMass':
                this.addToParent('bodymass', date('%YYYY%MM%DD', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierHeartRate':
                this.addToParent('heartrate', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierOxygenSaturation':
                const key = date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate);
                this.addToParent('bloodOxygen', key, parent);
                parent['bloodOxygen'].baromPressure = parent['bloodOxygen'].baromPressure ?? {};
                parent['bloodOxygen'].baromPressure[key] = this.metadata['HKMetadataKeyBarometricPressure'];
                break;
            case 'HKQuantityTypeIdentifierStepCount':
                this.addToParent('stepCount', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierDistanceWalkingRunning':
                this.addToParent('walkingRunning', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierBasalEnergyBurned':
                this.addToParent('basalEnergyBurned', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierActiveEnergyBurned':
                this.addToParent('activeEnergyBurned', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierFlightsClimbed':
                this.addToParent('flightsClimbed', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierAppleExerciseTime':
                this.addToParent('exerciseTime', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierRestingHeartRate':
                this.addToParent('restingHeartRate', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierVO2Max':
                this.addToParent('vO2max', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierWalkingHeartRateAverage':
                this.addToParent('walkingHeartRateAvg', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierEnvironmentalAudioExposure':
                this.addToParent('environmentalAudioExposure', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierHeadphoneAudioExposure':
                this.addToParent('headphoneAudioExposure', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage':
                this.addToParent('walkingDoubleSupportPercentage', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            case 'HKQuantityTypeIdentifierAppleStandTime':
                this.addToParent('standTime', date('%YYYY%MM%DD_%hh%mm%ss', this.creationDate), parent);
                break;
            default: 
                log.warn(`unkown record type ${this.type} in ${this.constructor.name}`);
                log.warn(log.inspect(this, {depth:1}));
                throw `unkown record type ${this.type}`;
        }
    }
}







interface BaseAttributes {
    sourceName:     string
    startDate:      string;
    endDate:        string;
}

/**
 * <!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord)*)>
 */
export interface HealthData {
    exportDate:         ExportDate;
    me:                 Me;
    record?:            Record[];
    correlation?:       Correlation[];
    workout?:           Workout[];
    activitySummary?:   ActivitySummary[];
    clinicalRecord?:    ClinicalRecord[];
}

interface HealthDataAttributes {
    locale: string;
}


/**
 * <!ELEMENT ExportDate EMPTY>
 * <!ATTLIST ExportDate
 *      value CDATA #REQUIRED
 * >
 */
export interface ExportDate {
    _attrs: ExportDateAttributes
}

interface ExportDateAttributes {
    value: string;
}

/**
 * <!ELEMENT Me EMPTY>
 * <!ATTLIST Me
 *      HKCharacteristicTypeIdentifierDateOfBirth         CDATA #REQUIRED
 *      HKCharacteristicTypeIdentifierBiologicalSex       CDATA #REQUIRED
 *      HKCharacteristicTypeIdentifierBloodType           CDATA #REQUIRED   
 *      HKCharacteristicTypeIdentifierFitzpatrickSkinType CDATA #REQUIRED
 * >
 */
export interface Me {
    _attrs: MeAttributes;
}
interface MeAttributes {
    dateOfBirth:    string;
    biologicalSex:  string;
    bloodType:      string;
    skinType:       string;
}

/**
 *  <!ELEMENT Record ((MetadataEntry|HeartRateVariabilityMetadataList)*)>
 *  <!ATTLIST Record
 *      type          CDATA #REQUIRED
 *      unit          CDATA #IMPLIED    
 *      value         CDATA #IMPLIED
 *      sourceName    CDATA #REQUIRED
 *      sourceVersion CDATA #IMPLIED
 *      device        CDATA #IMPLIED
 *      creationDate  CDATA #IMPLIED
 *      startDate     CDATA #REQUIRED
 *      endDate       CDATA #REQUIRED
 *  >
 */
export interface Record {
    _attrs:                 RecordAttributes;
    metaDateEntry:          MetadataEntry[];
    heartrateVariability:   HeartRateVariabilityMetadataList[];
}

interface DeviceAttributes extends BaseAttributes {
    sourceVersion?: string;
    device?:        string;
    creationDate?:  string;
}

interface RecordAttributes extends DeviceAttributes {
    type:           string;
    unit?:          string;    
    value?:         string;
}

/**
 *  <!ELEMENT Correlation ((MetadataEntry|Record)*)>
 *  <!ATTLIST Correlation
 *      type          CDATA #REQUIRED
 *      sourceName    CDATA #REQUIRED
 *      sourceVersion CDATA #IMPLIED
 *      device        CDATA #IMPLIED
 *      creationDate  CDATA #IMPLIED
 *      startDate     CDATA #REQUIRED
 *      endDate       CDATA #REQUIRED
 *  >
 */
export interface Correlation {
    _attrs: CorrelationAttributes;
    metaDateEntry:  MetadataEntry[];
    record:         Record[];
}   

interface CorrelationAttributes extends DeviceAttributes {}

/**
 *  <!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute)*)>
 *  <!ATTLIST Workout
 *      workoutActivityType   CDATA #REQUIRED
 *      duration              CDATA #IMPLIED
 *      durationUnit          CDATA #IMPLIED
 *      totalDistance         CDATA #IMPLIED
 *      totalDistanceUnit     CDATA #IMPLIED
 *      totalEnergyBurned     CDATA #IMPLIED
 *      totalEnergyBurnedUnit CDATA #IMPLIED
 *      sourceName            CDATA #REQUIRED
 *      sourceVersion         CDATA #IMPLIED
 *      device                CDATA #IMPLIED
 *      creationDate          CDATA #IMPLIED
 *      startDate             CDATA #REQUIRED
 *      endDate               CDATA #REQUIRED
 * >
 */
export interface Workout {
    _attrs: WorkoutAttributes;
    metadataEntry:  MetadataEntry[];
    workoutEvent:   WorkoutEvent[];
    workoutRoute:   WorkoutRoute[];
}

interface WorkoutAttributes extends DeviceAttributes {
    workoutActivityType:    string;
    duration?:              string;
    durationUnit?:          string;
    totalDistance?:         string;
    totalDistanceUnit?:     string;
    totalEnergyBurned?:     string;
    totalEnergyBurnedUnit?: string;
}

/**
 *  <!ELEMENT ActivitySummary EMPTY>
 *  <!ATTLIST ActivitySummary
 *      dateComponents           CDATA #IMPLIED
 *      activeEnergyBurned       CDATA #IMPLIED
 *      activeEnergyBurnedGoal   CDATA #IMPLIED
 *      activeEnergyBurnedUnit   CDATA #IMPLIED
 *      appleMoveTime            CDATA #IMPLIED
 *      appleMoveTimeGoal        CDATA #IMPLIED
 *      appleExerciseTime        CDATA #IMPLIED
 *      appleExerciseTimeGoal    CDATA #IMPLIED
 *      appleStandHours          CDATA #IMPLIED
 *      appleStandHoursGoal      CDATA #IMPLIED
 *  >
 */
export interface ActivitySummary {
    _attrs: ActivitySummaryAttributes;
}

interface ActivitySummaryAttributes {
    dateComponents?:         string;
    activeEnergyBurned?:     string;
    activeEnergyBurnedGoal?: string;
    activeEnergyBurnedUnit?: string;
    appleMoveTime?:          string;
    appleMoveTimeGoal?:      string;
    appleExerciseTime?:      string;
    appleExerciseTimeGoal?:  string;
    appleStandHours?:        string;
    appleStandHoursGoal?:    string;
}

/**
 *  <!ELEMENT ClinicalRecord EMPTY>
 *  <!ATTLIST ClinicalRecord
 *      type              CDATA #REQUIRED
 *      identifier        CDATA #REQUIRED
 *      sourceName        CDATA #REQUIRED
 *      sourceURL         CDATA #REQUIRED
 *      fhirVersion       CDATA #REQUIRED
 *      receivedDate      CDATA #REQUIRED
 *      resourceFilePath  CDATA #REQUIRED
 *  >
 */
export interface ClinicalRecord {
    _attrs: ClinicalRecordAttributes;
}

interface ClinicalRecordAttributes {
    type:               string;
    identifier:         string;
    sourceName:         string;
    sourceURL:          string;
    fhirVersion:        string;
    receivedDate:       string;
    resourceFilePath:   string;
}

/**
 *  <!ELEMENT MetadataEntry EMPTY>
 *  <!ATTLIST MetadataEntry
 *      key   CDATA #REQUIRED
 *      value CDATA #REQUIRED
 * >
 */
export interface MetadataEntry {
    _attrs: MetadataEntryAttributes;
}

interface MetadataEntryAttributes {
    key:    string;
    value:  string;
}

/**
 * <!-- Note: Heart Rate Variability records captured by Apple Watch may include an associated list of instantaneous beats-per-minute readings. -->
 * <!ELEMENT HeartRateVariabilityMetadataList (InstantaneousBeatsPerMinute*)>
 */
export interface HeartRateVariabilityMetadataList {
    instantaneousBPM: InstantaneousBeatsPerMinute[];
}

/**
 *  <!ELEMENT InstantaneousBeatsPerMinute EMPTY>
 *  <!ATTLIST InstantaneousBeatsPerMinute
 *      bpm  CDATA #REQUIRED
 *      time CDATA #REQUIRED
 *  >
 */
export interface InstantaneousBeatsPerMinute {
    _attrs: InstBPMAttributes;
}

interface InstBPMAttributes {
    bpm:    string;
    time:   string;
}

/**
 *  <!ELEMENT WorkoutEvent EMPTY>
 *  <!ATTLIST WorkoutEvent
 *      type         CDATA #REQUIRED
 *      date         CDATA #REQUIRED
 *      duration     CDATA #IMPLIED
 *      durationUnit CDATA #IMPLIED
 *  >
 */
export interface WorkoutEvent {
    _attrs: WorkoutEventAttributes;
}

interface WorkoutEventAttributes {
    type:           string;
    date:           string;
    duration?:      string;
    durationUnit?:  string;
}

/**
 *  <!ELEMENT WorkoutRoute ((MetadataEntry|FileReference)*)>
 *  <!ATTLIST WorkoutRoute
 *      sourceName    CDATA #REQUIRED
 *      sourceVersion CDATA #IMPLIED
 *      device        CDATA #IMPLIED
 *      creationDate  CDATA #IMPLIED
 *      startDate     CDATA #REQUIRED
 *      endDate       CDATA #REQUIRED
 * >
 */
export interface WorkoutRoute {
    _attrs:         WorkoutRouteAttributes;
    metadataEntry:  MetadataEntry[];
    fileReference:  FileReference[];
}

interface  WorkoutRouteAttributes extends DeviceAttributes {}


/**
 *  <!ELEMENT FileReference EMPTY>
 *  <!ATTLIST FileReference
 *      path CDATA #REQUIRED
 *  >
 */
export interface FileReference {
    _attrs: FileReferenceAttributes;
}

interface FileReferenceAttributes {
    path: string;
}