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

import { Log }      from 'hsnode';import { stringify } from 'querystring';
 const log = new Log('HealthKit');
import sax          from 'sax';

type StringMap =        {[name:string]:string};
type TransformerMap =   {[key:string]:Transformer|[string, Transformer]};

interface Transformer {
    (key:string, source:any): number | Date;
}
const toDate:Transformer    = (key:string, source:any) => {
    const val = new Date(source[key]);
    return isNaN(val.getTime())? undefined : val;
}
const toNumber:Transformer  = (key:string, source:any) => {
    const val = +source[key];
    return isNaN(val)? undefined : val;
}
const toHKCharType:Transformer  = (key:string, source:any) => {
    const hkKey = `HKCharacteristicTypeIdentifier${key[0].toUpperCase()}${key.slice(1)}`;
    return source[hkKey];
}

export interface TypedRecord {
    header:string[]; 
    values: any[][];
    abbr: any;
    bpm?: TypedRecord;
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
        throw `unkown HkRoot node type ${node.name} in ${this.constructor.name}\n${log.inspect(node)}`;
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
    records:any         = {};
    workouts:any        = {};
    activitySummaries:any = {header:<string[]>[], values:[], abbr:{}};

    constructor(node:sax.Tag) {
        super();
        this.addRequired(['locale'], node.attributes);
    }

    addActivitySummary(value:any, valueKey:string, lookup=false) {
        const record:TypedRecord = this.activitySummaries;  
        if (value !== undefined) {
            let col = record.header.indexOf(valueKey);
            if (col<0) { col = record.header.length; record.header.push(valueKey); }
            record.values[record.values.length-1][col] = lookup? getLookup(record.abbr, value) : value;
        }
    }

    addRecordValue(typeKey:string, value:any, valueKey:string, lookup=false) {
        const record:TypedRecord = this.records[typeKey];  
        if (value !== undefined) {
            if (typeof value === 'string') { value = value.replace(/,/g,'|'); } // replace commas for CSV
            let col = record.header.indexOf(valueKey);
            if (col<0) { col = record.header.length; record.header.push(valueKey); }
            record.values[record.values.length-1][col] = lookup? getLookup(record.abbr, value) : value;
        }
    }

    addRecordBPMValue(typeKey:string, value:number, valueKey:string, startDate:string) {
        const record:TypedRecord = this.records[typeKey];  
        if (!record.bpm.header) {
            record.bpm.header = ['Date', 'Time', 'Value'];
            record.bpm.values = [];
            record.bpm.abbr = {};
        }
        if (!isNaN(value)) {
            record.bpm.values.push([startDate, valueKey, value]);
        }
    }

    add(node:sax.Tag):HkNode {
        switch (node.name) {
            case 'ExportDate':  this.exportDate = new Date(node.attributes.value); 
                                return undefined;
            case 'Me':          return this.me = new HkMe(node);
            case 'Record':      return new HkRecord(node, this);
            case 'Workout':     return new HkWorkout(node, this);

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
            case 'ActivitySummary':
                this.activitySummaries.values.push([]);
                Object.keys(node.attributes).forEach(k => {
                    this.addActivitySummary(node.attributes[k], k);
                });
                return undefined;
            default: 
                log.warn(`unknown HkHealthData node ${node.name} in ${this.constructor.name}\n${log.inspect(node, {depth:5})}`);
                return undefined;
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
        throw `unkown HkExportDate node type ${node.name} in ${this.constructor.name}\n${log.inspect(node, {depth:5})}`;
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
        throw `unkown HkMe node type ${node.name} in ${this.constructor.name}\n${log.inspect(node)}`;
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
    static types = {};
    type: string;
    startDate: string;
    constructor(node:sax.Tag, public healthData:HkHealthData) {
        super();
        if (!HkRecord.types[node.attributes.type]) {
            log.info(`found Record type '${node.attributes.type}'`);
            HkRecord.types[node.attributes.type] = true;
        }
        const match = node.attributes.type.match(/^HK.*TypeIdentifier(.+)$/) || node.attributes.type.match(/^HK.*Type(.+)$/)
        if (!match || match?.length<=0) { throw `unexpected type '${node.attributes.type}'`; }
        this.type = match[1];
        const r:TypedRecord = healthData.records[this.type] = healthData.records[this.type] ?? {header:<string[]>[], values:[], bpm:{}, abbr:{}};
        r.values.push([]);
        this.startDate = node.attributes.startDate;
        const startMS    = new Date(node.attributes.startDate).getTime();
        const endMS      = new Date(node.attributes.endDate).getTime();
        const creationMS = new Date(node.attributes.creationDate).getTime();
        healthData.addRecordValue(this.type, node.attributes.unit, 'unit');
        healthData.addRecordValue(this.type, node.attributes.startDate, 'startDate');
        healthData.addRecordValue(this.type, endMS-startMS, 'endDate');
        healthData.addRecordValue(this.type, creationMS-startMS, 'creationDate');
        healthData.addRecordValue(this.type, node.attributes.sourceName, 'sourceName', true);
        healthData.addRecordValue(this.type, node.attributes.sourceVersion, 'sourceVersion');
        healthData.addRecordValue(this.type, node.attributes.device, 'device', true);
        healthData.addRecordValue(this.type, +node.attributes.value, 'value');
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
                this.healthData.addRecordValue(this.type, node.attributes.value, node.attributes.key);
                return undefined;
            case 'HeartRateVariabilityMetadataList': return new HkHeartRateVariabilityMetadataList(node, this);
            
            default: 
                log.warn(`unknown HkRecord node name ${node.name} in ${this.constructor.name}`);
                log.warn(log.inspect(node));
                return undefined;
       }
    }
}

/**
 * <!-- Note: Heart Rate Variability records captured by Apple Watch may include an associated list of instantaneous beats-per-minute readings. -->
 * <!ELEMENT HeartRateVariabilityMetadataList (InstantaneousBeatsPerMinute*)>
 */
class HkHeartRateVariabilityMetadataList extends HkNode {
    constructor(node:sax.Tag, protected parent:HkRecord) {
        super();
    }
    add(node:sax.Tag):HkNode {
        switch (node.name) {
            /**
             * <!ELEMENT InstantaneousBeatsPerMinute EMPTY>
             * <!ATTLIST InstantaneousBeatsPerMinute
             *      bpm  CDATA #REQUIRED
             *      time CDATA #REQUIRED
             * >
             */
            case 'InstantaneousBeatsPerMinute':   
                this.parent.healthData.addRecordBPMValue(this.parent.type, +node.attributes.bpm, node.attributes.time, this.parent.startDate);
                return undefined;
            
            default: 
                log.warn(`unknown HkHeartRateVariabilityMetadataList node name ${node.name} in ${this.constructor.name}`);
                log.warn(log.inspect(node));
                return undefined;
       }
    }
}

/**
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
 */
export class HkWorkout extends HkNode {
    static types = {};
    type = 'Workout';
    header:any = {};
    events:any[] = [];
    routes:any[] = [];
    abbr:any = {};
    constructor(node:sax.Tag, protected healthData:HkHealthData) {
        super();
        if (!HkWorkout.types[node.attributes.workoutActivityType]) {
            log.info(`found Workout type '${node.attributes.workoutActivityType}'`);
            HkWorkout.types[node.attributes.workoutActivityType] = true;
        }
        const match = node.attributes.workoutActivityType.match(/^HK.*Type(.+)$/)
        if (!match || match?.length<=0) { throw `unexpected workout type '${node.attributes.workoutActivityType}'`; }
        this.type = match[1];

        healthData.workouts[this.type] = healthData.workouts[this.type] ?? {header:this.header, events:this.events, routes:this.routes, abbr:this.abbr};
        const startMS    = new Date(node.attributes.startDate).getTime();
        const endMS      = new Date(node.attributes.endDate).getTime();
        const creationMS = new Date(node.attributes.creationDate).getTime();
        this.addWorkoutHeaderField(node.attributes.startDate, 'startDate');
        this.addWorkoutHeaderField(endMS-startMS, 'endDate');
        this.addWorkoutHeaderField(creationMS-startMS, 'creationDate');
        this.addWorkoutHeaderField(+node.attributes.duration, 'duration');
        this.addWorkoutHeaderField(node.attributes.durationUnit, 'durationUnit');
        this.addWorkoutHeaderField(+node.attributes.totalDistance, 'totalDistance');
        this.addWorkoutHeaderField(node.attributes.totalDistanceUnit, 'totalDistanceUnit');
        this.addWorkoutHeaderField(+node.attributes.totalEnergyBurned, 'totalEnergyBurned');
        this.addWorkoutHeaderField(node.attributes.totalEnergyBurnedUnit, 'totalEnergyBurnedUnit');
        this.addWorkoutHeaderField(node.attributes.sourceName, 'sourceName', true);
        this.addWorkoutHeaderField(node.attributes.sourceVersion, 'sourceVersion');
        this.addWorkoutHeaderField(node.attributes.device, 'device', true);
    }
    addWorkoutHeaderField(value:any, valueKey:string, lookup=false) {
        if (value !== undefined) {
            this.header[valueKey] = lookup? getLookup(this.abbr, value) : value;
        }
    }
    addWorkoutEvent(value:any, valueKey:string, lookup=false) {
        if (value !== undefined) {
            this.header[valueKey] = lookup? getLookup(this.abbr, value) : value;
        }
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
                this.addWorkoutHeaderField(node.attributes.value, node.attributes.key);
                return undefined;
            /**
             * <!ELEMENT WorkoutEvent EMPTY>
             * <!ATTLIST WorkoutEvent
             *  type         CDATA #REQUIRED
             *  date         CDATA #REQUIRED
             *  duration     CDATA #IMPLIED
             *  durationUnit CDATA #IMPLIED
             * >
             */
            case 'WorkoutEvent': 
                this.events.push(node.attributes);
                return undefined;
            
            case 'WorkoutRoute': return new HkWorkoutRoute(node, this);


            default: 
                log.warn(`unknown HkWorkout node name ${node.name} in ${this.constructor.name}`);
                log.warn(log.inspect(node));
                return undefined;
       }
    }
}

/**
 * <!ELEMENT WorkoutRoute ((MetadataEntry|FileReference)*)>
<!ATTLIST WorkoutRoute
  sourceName    CDATA #REQUIRED
  sourceVersion CDATA #IMPLIED
  device        CDATA #IMPLIED
  creationDate  CDATA #IMPLIED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
 */
export class HkWorkoutRoute extends HkNode {
    route = {};
    constructor(node:sax.Tag, protected workout:HkWorkout) {
        super();
        const startMS    = new Date(node.attributes.startDate).getTime();
        const endMS      = new Date(node.attributes.endDate).getTime();
        const creationMS = new Date(node.attributes.creationDate).getTime();
        this.route['sourceName']    = node.attributes.sourceName;
        this.route['sourceVersion'] = node.attributes.sourceVersion;
        this.route['startDate']     = node.attributes.startDate;
        this.route['endDate']       = endMS - startMS;
        this.route['creationDate']  = creationMS - startMS;
        Object.keys(node.attributes).forEach(k => !this.route[k]? this.route[k] = node.attributes[k] : '')
        workout.routes.push(this.route);
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
                this.route[node.attributes.key] = node.attributes.value;
                return undefined;
            /**
             *  <!ELEMENT FileReference EMPTY>
             *  <!ATTLIST FileReference
             *      path CDATA #REQUIRED
             *  >
             */
            case 'FileReference': 
                this.route['FileReference'] = node.attributes.path;
                return undefined;
            
            default: 
                log.warn(`unknown HkWorkoutRoute node name ${node.name} in ${this.constructor.name}`);
                log.warn(log.inspect(node, {depth:5}));
                return undefined;
       }
    }
}

function getLookup(abbr:any, value:string) {
    const id = abbr[value] = abbr[value] ?? `_${Object.keys(abbr).length}`;
    abbr[id] = value;
    return id;
}
