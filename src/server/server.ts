import { Log, fs as hsfs }      from 'hsnode'; const log = new Log('server');
import fs           from 'fs';
import sax          from 'sax';
import { HkRoot, HkNode } 
                    from './HealthKit';


const file = './data/export.xml';

let current:HkNode;

const stack:HkNode[] = [];

async function parse(file:string):Promise<HkNode> {
        const parser = sax.createStream(true, {});
        const size = await hsfs.fileSize(file);
        return new Promise((resolve, reject) => {
        try {
            parser.on('error', (e) => reject(e));
            parser.on('text',(t) => {
                if (t.trim().length>0) { log.info(`text '${t}`); }
            });
            parser.on('opentag', (node) => { 
                // opened a tag.  node has "name" and "attributes"
                const n = current.add(<sax.Tag>node);
                stack.push(current); 
                current = n;
                log.transient(`${Math.floor(stream.bytesRead/size*100)}%`);
            });
            parser.on('closetag', (args) => {
                const parent = stack.pop();
                current?.close(parent);
                current = parent;
            });
            parser.on('end', () => { resolve(current); });
            const stream = fs.createReadStream(file);
            stream.pipe(parser);      
        } catch(e) {
            reject(e)
        }
    })
}

async function main() {
    log.info(`converting '${file}'`);
    current = new HkRoot();
    try {
        const data:HkNode = await parse(file);
        hsfs.writeJsonFile('./data/data.json', data);
        log.info(log.inspect(data, {depth:1}));
    } catch(e) {
        log.warn(e);
    }
}

main(); 

