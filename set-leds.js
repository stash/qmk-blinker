const EventEmitter = require('events');
const HID = require('node-hid');

const VENDOR_ID = 12951;
const PRODUCT_ID = 18806;
const RAW_USAGE_PAGE = 0xFF60;
const RAW_USAGE_ID = 0x61;

const BLINKY_CMD_INIT = 1;
const BLINKY_CMD_SET_ALL = 2;
const BLINKY_CMD_SET_ONE = 3;
const BLINKY_CMD_SET_MANY = 4;

const BLINKY_EVT_INIT = 0x80;
const BLINKY_EVT_LAYER = 0x81;

const ergodoxEzLayoutMap = [
    28, 27, 26, 25, 24,      0,  1,  2,  3,  4,
    33, 32, 31, 30, 29,      5,  6,  7,  8,  9,
    38, 37, 36, 35, 34,     10, 11, 12, 13, 14,
    43, 42, 41, 40, 39,     15, 16, 17, 18, 19,
    47, 46, 45, 44,             20, 21, 22, 23,
];

function convertPrettyLayout(layout, layoutMap) {
    let output = Array(48);
    for (let i = 0; i<layout.length; i++) {
        output[layoutMap[i]] = layout[i];
    }
    return output;
}

const RED = {r:0xff, g:0, b:0};
const ORANG = {r:0xff, g:0x7f, b:0};
const YELLO = {r:0xff, g:0xff, b:0};
const GREEN = {r:0, g:0xff, b:0};
const CYAN = {r:0, g:0xff, b:0xff};
const BLUE = {r:0, g:0, b:0xff};
const MGNTA = {r:0xff, g:0, b:0xff};
const PINK = {r:0xff, g:0x7f, b:0xff};
const PURPL = {r:0x7f, g:0, b:0xff};
const WHITE = {r:0xff, g:0xff, b:0xff};
const GREY = {r:0x7f, g:0x7f, b:0x7f};
const BLACK = {r:0, g:0, b:0};

const myLayout = [
    GREEN, BLACK, BLUE , BLUE , BLUE ,    MGNTA, PINK , MGNTA, PINK , MGNTA,
    RED  , ORANG, GREEN, GREEN, BLUE ,    BLUE , BLACK, YELLO, BLUE , YELLO,
    ORANG, ORANG, ORANG, GREEN, BLUE ,    BLACK, BLACK, BLACK, BLACK, BLACK,
    BLUE , BLUE , YELLO, BLUE , BLUE ,    BLACK, BLUE , BLACK, GREY , BLACK,
    BLACK, WHITE, WHITE, WHITE,                  WHITE, CYAN , PURPL, WHITE,
];

const matches = HID.devices().filter((d) => {
    return d.vendorId == VENDOR_ID &&
        d.productId == PRODUCT_ID &&
        d.usagePage == RAW_USAGE_PAGE &&
        d.usage == RAW_USAGE_ID;
});
if (matches.length == 0) {
    console.error("no raw-HID devices");
    process.exit(1);
}
else if (matches.length > 1) {
    console.error("too many matches");
    process.exit(2);
}
else {
    console.log("connected", matches[0]);
}

const ee = new EventEmitter();

const device = new HID.HID(matches[0].path);
const reportNumber = 0x42;
let epSize = 8; // start small
let totalLEDs = 1;
device.on('data', onData);
device.on('error', onError);
ee.on('layer',onLayer);
begin();

function onData(msg) {
    //console.log("recieved", msg.length, msg);
    const eventNum = msg[0];
    //console.log("event 0x"+eventNum.toString(16));

    if (eventNum == BLINKY_EVT_INIT) {
        ee.emit('init', msg);
    }
    else if (eventNum == BLINKY_EVT_LAYER) {
        const layer = msg[1].toString(16);
        ee.emit('layer', layer);
    }
    else {
        console.error("unknown event");
    }
}

function onError(e) {
    console.error(e);
    process.exit(1);
}

function write(msg) {
    msg[0] = reportNumber;
    //console.log('writing', msg);
    var wrote = device.write(msg);
    //console.log('sent bytes', wrote);
}

///////

function begin() {
    const packet = Buffer.alloc(epSize);
    packet[1] = BLINKY_CMD_INIT;
    ee.on('init', (msg) => {
        const version = msg[1];
        epSize = msg[2];
        totalLEDs = msg.readInt16BE(3);
        if (version != 2) {
            console.error("wrong protocol version");
            process.exit(1);
        }
        let currentLayer = msg[5];
        console.log("epsize (RAW HID packet size) set to", epSize);
        console.log("total LEDs", totalLEDs);
        console.log("current layer", currentLayer);
        ee.emit('layer', currentLayer);
    });
    write(packet);
}

function onLayer(layer) {
    console.log("new layer", layer);
    layer = layer || 0;
    if (layer != 1) return;

    const layout = convertPrettyLayout(myLayout, ergodoxEzLayoutMap);
    setLayout(layout);
}

function setLayout(layout) {
    const headerSize = 3;
    const perPacket = Math.floor((epSize - headerSize) / 3);

    let led = 0;
    while (led < totalLEDs) {
        //console.log("start index", led);
        let packet = Buffer.alloc(epSize + 1);
        let i = 1;
        packet[i++] = BLINKY_CMD_SET_MANY;
        packet.writeInt16BE(led, i); // initial LED offset
        i += 2;

        for (let p = 0; p < perPacket; p++) {
            let rgb = layout[led++];
            packet[i++] = rgb.r;
            packet[i++] = rgb.g;
            packet[i++] = rgb.b;
            if (led >= totalLEDs) break;
        }

        write(packet);
    }
}
