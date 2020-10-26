const HID = require('node-hid');

const VENDOR_ID = 12951;
const PRODUCT_ID = 18806;
const RAW_USAGE_PAGE = 0xFF60;
const RAW_USAGE_ID = 0x61;



//console.log('devices:', HID.devices().filter((d) => {
    //return d.product == 'ErgoDox EZ Glow'
//}));

const matches = HID.devices().filter((d) => {
    return d.vendorId == VENDOR_ID &&
        d.productId == PRODUCT_ID &&
        d.usagePage == RAW_USAGE_PAGE &&
        d.usage == RAW_USAGE_ID;
});
console.log('raw HID qmk devices:', matches);
if (matches.length == 0) {
    console.error("no raw-HID devices");
    process.exit(1);
}
else if (matches.length > 1) {
    console.error("too many matches");
    process.exit(2);
}

const device = new HID.HID(matches[0].path);
const reportNumber = 0x42;
let dataCb = null;
let epSize = 8; // start small
let totalLEDs = 1;
device.on('data', onData);
device.on('error', onError);
begin();

function begin() {
    const packet = Buffer.alloc(epSize);
    packet[0] = reportNumber;
    packet[1] = 0x0;
    dataCb = (msg) => {
        const version = msg[1];
        epSize = msg[2];
        totalLEDs = msg.readInt16BE(3);
        if (version != 1) {
            console.error("wrong protocol version");
            process.exit(1);
        }
        console.log("epsize (RAW HID packet size) set to", epSize);
        console.log("total LEDs", totalLEDs);
        process.nextTick(allOn);
    };
    write(packet);
}

function write(msg) {
    console.log('writing', msg);
    var wrote = device.write(msg);
    console.log('sent bytes', wrote);
}

function onData(msg) {
    console.log("recieved", msg.length, msg);
    console.log("result code: "+msg[0].toString(16));
    const tempCb = dataCb;
    dataCb = null;
    if (tempCb != null) {
        try {
            tempCb(msg);
        } catch (e) {
            console.trace(e);
            process.exit(1);
        }
    } else {
        console.error("no current data handler");
    }
}

function onError(e) {
    console.error(e);
    process.exit(1);
}

function allOn() {
    const packet = Buffer.alloc(epSize + 1);
    packet[0] = reportNumber;
    packet[1] = 0x2;
    dataCb = (msg) => {
        setTimeout(allOff, 1000);
    };
    write(packet);
}
function allOff() {
    const packet = Buffer.alloc(epSize + 1);
    packet[0] = reportNumber;
    packet[1] = 0x1;
    dataCb = (msg) => {
        setTimeout(setAll, 1000);
    };
    write(packet);
}

function setAll() {
    const packet = Buffer.alloc(epSize + 1);
    packet[0] = reportNumber;
    packet[1] = 0x3; // set all
    packet[2] = 64;
    packet[3] = 64;
    packet[4] = 0;
    dataCb = (msg) => {
        //setTimeout(scan, 1000);
        setTimeout(setMany, 1000);
    };
    write(packet);
}

let scanIndex = 0;
function scan() {
    const packet = Buffer.alloc(epSize + 1);
    if (scanIndex >= totalLEDs) {
        process.exit(0);
    }

    packet[0] = reportNumber;
    packet[1] = 0x4; // set index command
    packet[2] = 0; // index MSB
    packet[3] = scanIndex++; // index LSB
    packet[4] = 0; // r
    packet[5] = 255; // g
    packet[6] = 255; // b
    write(packet);
    dataCb = (msg) => {
        let ackIndex = msg.readInt16BE(1);
        console.log("ack", ackIndex);
        setTimeout(scan,500);
    };
}

function setMany() {
    let RGBs = [];
    for (let n = 0; n < totalLEDs; n++) {
        let r = (n * 11) % 256;
        let g = (n * 13) % 256;
        let b = (n * 7) % 256;
        RGBs.push({r,g,b});
    }

    const headerSize = 3;
    const perPacket = Math.floor((epSize - headerSize) / 3);

    let index = 0;
    while (index < totalLEDs) {
        console.log("start index", index);
        let packet = Buffer.alloc(epSize + 1);
        let i = 0;
        packet[i++] = reportNumber;
        packet[i++] = 0x5; // set many command
        packet[i++] = 0; // index MSB
        packet[i++] = index; // index LSB

        for (let p = 0; p < perPacket; p++) {
            let rgb = RGBs[index++];
            packet[i++] = rgb.r;
            packet[i++] = rgb.g;
            packet[i++] = rgb.b;
            if (index >= totalLEDs) break;
        }

        write(packet);
    }

    let got = 0;
    function waitMore(msg) {
        let startIndex = msg.readInt16BE(1);
        let endIndex = msg.readInt16BE(3);
        console.log("ack", startIndex, endIndex);
        if (endIndex >= totalLEDs) process.exit(0);
        else dataCb = waitMore;
    }

    dataCb = waitMore;
}
