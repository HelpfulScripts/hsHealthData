import { Log, fs as hsfs }  from 'hsnode'; const log = new Log('server');
import fs           from 'fs';
import sax          from 'sax';
import { HkRoot, HkNode, TypedRecord } 
                    from './HealthKit';


const file = './data/export.xml';

let current:HkNode;

const stack:HkNode[] = [];

const temp:string[] = [];

async function parse(file:string):Promise<HkNode> {
    const parser = sax.createStream(true, {});
    const size = await hsfs.fileSize(file);
    const stream = fs.createReadStream(file);
    return new Promise((resolve, reject) => {
        try {
            stream.pipe(parser);      
            parser.on('text',(t) => t.trim().length>0? log.info(`text '${t}`) : '');
            parser.on('opentag', (node) => { try {
                // opened a tag.  node has "name" and "attributes"
                const n = current.add(<sax.Tag>node);
                temp.push(node.name);
                stack.push(current); 
                current = n;
                log.transient(`${Math.floor(stream.bytesRead/size*100)}%`);
            } catch(e) { 
                log.warn(`${e} in node ${node.name}:\n${log.inspect(node,{depth:5})}\n[${temp.join(', ')}]`); 
                log.warn(e.stack);
                throw ''
            }});
            parser.on('closetag', (args) => {
                current = stack.pop();
                temp.pop();
            });
            parser.on('end', () => { resolve(current); });
            parser.on('error', (e) => reject(e));
        } catch(e) {
            reject(e)
        }
    })
}

async function main() {
    log.info(`converting '${file}'`);
    current = new HkRoot();
    try {
        const data:any = await parse(file);
        hsfs.writeJsonFile('./data/data.json', data);

        const healthData = {};
        const ignore = ['records', 'activitySummaries'];
        Object.keys(data.healthData).forEach(k => {
            if (ignore.indexOf(k)<0) {
                healthData[k] = data.healthData[k];
                data.healthData[k] = undefined;
            }
        });
        hsfs.writeJsonFile('./data/healthData.json', healthData);
        log.info(`saved 'healthData.json'`);

        // replaceShorts(data.healthData.activitySummaries);
        saveTable(data.healthData.activitySummaries, 'activitySummaries');
        data.healthData.activitySummaries = undefined;

        for (const k in data.healthData.records) { 
            const records:TypedRecord = data.healthData.records[k];
            await saveTable(records, k); 
            const bpmTimes = Object.keys(records.bpm);
            if (bpmTimes.length>0) { await saveTable(records.bpm, `${k}.bpm`); }
            log.info(`saved '${k}.json'`);
            data.healthData.records[k] = undefined;
        }
        log.info('done');
    } catch(e) {
        log.warn(e);
    }
}

async function saveTable(table:TypedRecord, name:string) {
    log.transient(`saving... '${name}'`);
    await hsfs.writeJsonFile(`./data/${name}.json`, table);
    if (table?.values?.length>0) { 
        await hsfs.writeFile(`./data/csv/${name}.csv`, Object.keys(table.abbr).filter(k => k.charAt(0)==='_').map(k => `${k}, ${table.abbr[k]}`).join('\n'));
        await hsfs.appendFile(`./data/csv/${name}.csv`, `\n${table.header.join(',')}`);
        for (const row of table.values) {
            await hsfs.appendFile(`./data/csv/${name}.csv`, `\n${row.join(',')}`)
        }
    }
    log.info(`saved '${name}.csv'`);
}

main(); 

