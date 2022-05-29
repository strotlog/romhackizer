var module_requirejs
var module_compressjs
var module_jsyaml

// include using require.js
// define([dependencies list], callback):
define(['require', 'compressjs/main.min', 'js-yaml/js-yaml.min'],
       function (_requirejs, _compressjs, _jsyaml) {

    module_requirejs = _requirejs
    module_compressjs = _compressjs
    module_jsyaml = _jsyaml

    return {
        archipelagomagic: function(apsm, modifications, vanillaRomhack, offsetsInRomOf100ItemPlms, hackname) {
            ap = new archipelagoclass(apsm, modifications, vanillaRomhack, offsetsInRomOf100ItemPlms, hackname)
            this.ap = ap
            ap.extractApsmData()
            ap.expandRom()
            ap.copy100PlmsAndNothings()
            ap.applyModifications()
            ap.copyLimitedApsmData()
            return ap.copyRandoToZip()
        },
    }
})

class archipelagoclass {
    constructor(apsm, modifications, vanillaRomhack, offsetsInRomOf100ItemPlms, hackname) {
        this.apsm = apsm
        this.modifications = modifications
        this.vanillaRomhack = vanillaRomhack
        this.offsetsInRomOf100ItemPlms = offsetsInRomOf100ItemPlms
        this.hackname = hackname
        this.name = 'archipelago'
        this.zip = new zipfile0(this.apsm, "delta.bsdiff4")
    }

    expandRom() {
        if (this.hackname == 'rotation') {
            this.bsdiff_romhack_toberandoed.expandtosize(romSize_Rotation, 0xff)
        } else {
            console.log('unknown hackname "' + this.hackname + '" in expandRom')
        }
    }

    extractApsmData() {
        let bsfile = this.zip.extract()
        this.bsdiff_rando = new bsdiff(bsfile)
        this.bsdiff_rando.processInitialDiff()
        // ehh.. we could conceivably someday modify the bsdiff in-place, but we'd kind of need to apply the whole romhack ips. right now, we have rotation, and the player has vanilla. so use bsdiff_rando as read-only
        this.bsdiff_romhack_toberandoed = new bsdiff([])
        this.bsdiff_romhack_toberandoed.initializeForFullOverwrite(this.vanillaRomhack) // will ignore the player's vanilla game
    }

    copy100PlmsAndNothings() {
        for (const address of this.offsetsInRomOf100ItemPlms) {
            // see patchmain in other file for comments
            let plm = this.bsdiff_rando.read({baseFile: this.vanillaRomhack /* close enough to vanilla */}, address, 2)
            // note, this may be overwriting this.vanillaRomhack buffer, so the original data for this address is no longer readable after this point (as it requires mixing with this.vanillaRomhack)
            this.bsdiff_romhack_toberandoed.overwrite(address, plm)
            let itemcopied = plm[0] + plm[1]*256
            if (itemcopied == 0xbae9) {
                this.bsdiff_romhack_toberandoed.overwrite(address, [0x2f, 0xb6]) // 'nothing' chozo or 'nothing' in the open
            }
            if (itemcopied == 0xbaed) {
                this.bsdiff_romhack_toberandoed.overwrite(address, [0x83, 0xef]) // 'nothing' shot block
                this.bsdiff_romhack_toberandoed.overwrite(address+4, [0x20, 0x05]) // hackery to avoid new PLM (see patchmain comments)
            }
            if (itemcopied == 0) {
                console.log('Error: we read PLM value of 0 (should be a ROM pointer) @ rom offset 0x' + address.toString(16))
            }
        }
    }

    applyModifications() {
        for (const modification of this.modifications) {
            this.bsdiff_romhack_toberandoed.overwrite(modification.address, modification.bytes)
        }
    }

    copyLimitedApsmData() {
        let table = null
        if (this.hackname == 'rotation') {
            table = copyFromMultiworldTo_Rotation
        } else {
            console.log('unknown hackname "' + this.hackname + '" in copyLimitedApsmData')
        }
        function romOffsetFromSnesAddrString(snesAddrString) {
            if (snesAddrString[0] == "$") {
                snesAddrString = snesAddrString.substring(1)
            }
            let [bank, highwithin] = snesAddrString.split(":")
            bank = parseInt("0x" + bank)
            highwithin = parseInt("0x" + highwithin)
            return (bank - 0x80)*0x8000 + (highwithin - 0x8000)
        }
        for (const entry of table) {
            let arr = new Uint8Array(entry.length)
            if (Array.isArray(entry.vanilla)) {
                for (let i = 0; i < entry.length; i++) {
                    arr[i] = entry.vanilla[i]
                }
            } else if (typeof entry.vanilla === 'string' || entry.vanilla instanceof String) {
                for (let i = 0; i < entry.vanilla.length; i++) {
                    arr[i] = entry.vanilla.charCodeAt(i)
                }
            } else {
                // assume single byte
                for (let i = 0; i < entry.length; i++) {
                    arr[i] = entry.vanilla
                }
            }
            let data = this.bsdiff_rando.read({bufferAtThisAddress: arr, fallbackBaseFile: this.vanillaRomhack}, romOffsetFromSnesAddrString(entry.old), entry.length)
            this.bsdiff_romhack_toberandoed.overwrite(romOffsetFromSnesAddrString(entry.new), data)
        }
    }

    copyRandoToZip() {
        return this.zip.replacefile(this.bsdiff_romhack_toberandoed.repack())
    }

}

// data:

romSize_Rotation = 3*1024*1024 /* 3MiB vanilla */ + 4*0x8000 // go 4 banks beyond vanilla end: 2 new banks ($E0, $E1) for vanilla-rotation, +2 new banks ($E2, $E3) for multiworld

// from https://github.com/strotlog/SMBasepatch/.../rotation/multiworld.sym
copyFromMultiworldTo_Rotation = [
    {"symbol" : "message_item_names", "new": "85:9963", "old": "85:9963", "length": 7744, vanilla : 0xFF },
    {"symbol" : "rando_item_table", "new": "E2:E000", "old": "B8:E000", "length": 4096, vanilla: 0xFF },
    {"symbol" : "sm_item_graphics", "new": "84:F882", "old": "84:F882", "length": 230, vanilla: 0xFF },
    {"symbol" : "offworld_graphics", "new": "89:9100", "old": "89:9100", "length": 512, vanilla: 0x00 },
    {"symbol" : "config_deathlink", "new": "CE:FF04", "old": "CE:FF04", "length": 1, vanilla: 0xFF },
    {"symbol" : "config_remote_items", "new": "CE:FF06", "old": "CE:FF06", "length": 1, vanilla: 0xFF },
    {"symbol" : "rando_player_table", "new": "E2:D000", "old": "B8:D000", "length": 2048, vanilla: 0xFF },
    {"symbol" : "rando_player_id_table", "new": "E2:D800", "old": "B8:D800", "length": 400, vanilla: 0xFF },
    {"symbol" : "snes_header_game_title", "new": "80:FFC0", "old": "80:FFC0", "length": 21, vanilla: 'Super Metroid'.padEnd(21, ' ')}
]

// end data region

// allows live modification of a zip file that is *uncompressed* already (basically a .tar in .zip form)
class zipfile0 {
    constructor(data, filename) {
        this.data = data
        this.filename = filename
        this.name = 'zipfile0'
    }

    extract() {
        // https://users.cs.jmu.edu/buchhofp/forensics/formats/pkzip-printable.html
        let i = 0
        let found1 = false
        let found2 = false
        let signature = (this.data[i] << 24) + (this.data[i+1] << 16) + (this.data[i+2] << 8) + this.data[i+3]
        while (signature == 0x504b0304) { // local file header signature (written in byte string order)
            // process local file headers
            let fheader = this.data.slice(i, i+0x1e)
            if ((fheader[0x03] & 0x08) != 0) {
                console.log('error: not implemented: "data descriptor" flag in zip')
            }
            let compressedsize = fheader[0x12] + (fheader[0x13] << 8) + (fheader[0x14] << 16) + (fheader[0x15] << 24)
            let uncompressedsize = fheader[0x16] + (fheader[0x17] << 8) + (fheader[0x18] << 16) + (fheader[0x19] << 24)
            if (compressedsize != uncompressedsize) {
                console.log('error: not implemented: zip-compressed data (' + uncompressedsize + ' != ' + compressedsize + ')')
            }
            let namelen = fheader[0x1a] + (fheader[0x1b] << 8)
            let extralen = fheader[0x1c] + (fheader[0x1d] << 8)
            let namebytes = this.data.slice(i+0x1e, i+0x1e+namelen)
            let fname = String.fromCharCode.apply(String, namebytes)
            if (fname == this.filename) {
                // found our file
                this.localheaderoffset = i
                this.localheaderfulllength = 0x1e + namelen + extralen
                this.filedataoffset = i + 0x1e + namelen + extralen
                this.filesize = compressedsize
                found1 = true
            }
            i += 0x1e + namelen + extralen + compressedsize
            signature = (this.data[i] << 24) + (this.data[i+1] << 16) + (this.data[i+2] << 8) + this.data[i+3]
        }
        if (signature != 0x504b0102) { // central directory file header (written in byte string order)
            console.log('error: not implemented: unknown zip file component signature 0x' + signature.toString(16) + ' @ offset ' + i)
        }
        while (signature == 0x504b0102) { // central directory file header (written in byte string order)
            let fheader = this.data.slice(i, i+0x2e)
            let namelen = fheader[0x1c] + (fheader[0x1d] << 8)
            let extralen = fheader[0x1e] + (fheader[0x1f] << 8)
            let commentlen = fheader[0x20] + (fheader[0x21] << 8)
            let namebytes = this.data.slice(i+0x2e, i+0x2e+namelen)
            let fname = String.fromCharCode.apply(String, namebytes)
            if (fname == this.filename) {
                // found our file (again)
                this.centralDirectoryFileHeaderOffset = i
                found2 = true
            }
            i += 0x2e + namelen + extralen + commentlen
            signature = (this.data[i] << 24) + (this.data[i+1] << 16) + (this.data[i+2] << 8) + this.data[i+3]
        }
        // should just end with a 0x504b0506
        if (signature != 0x504b0506) {
            console.log('error: not implemented: unknown zip file end component signature 0x' + signature.toString(16) + ' @ offset ' + i)
        }
        this.filesSectionLengthOffset = i + 0x10
        if (!found1) {
            console.log('error: did not find filename "' + this.filename + '" among local file headers in zip')
        }
        if (!found2) {
            console.log('error: did not find filename "' + this.filename + '" among central directory file headers in zip (end of zip)')
        }
        return this.data.slice(this.filedataoffset, this.filedataoffset + this.filesize)
    }

    replacefile(newdata) {
        let newcrc = crc32(newdata)
        let ret = new Uint8Array(this.data.length - this.filesize + newdata.length)
        console.log('new zip length: ' + ret.length)
        for (let j = 0; j < this.localheaderoffset; j++) {
            ret[j] = this.data[j]
        }
        let cur = this.localheaderoffset
        let fheader = this.data.slice(this.localheaderoffset, this.localheaderoffset + this.localheaderfulllength)
        fheader[0x0e] = (newcrc       ) & 0xff
        fheader[0x0f] = (newcrc >>>  8) & 0xff
        fheader[0x10] = (newcrc >>> 16) & 0xff
        fheader[0x11] = (newcrc >>> 24) & 0xff
        fheader[0x12] = (newdata.length       ) & 0xff
        fheader[0x13] = (newdata.length >>>  8) & 0xff
        fheader[0x14] = (newdata.length >>> 16) & 0xff
        fheader[0x15] = (newdata.length >>> 24) & 0xff
        fheader[0x16] = fheader[0x12]
        fheader[0x17] = fheader[0x13]
        fheader[0x18] = fheader[0x14]
        fheader[0x19] = fheader[0x15]
        for (let j = 0; j < fheader.length; j++) {
            ret[cur+j] = fheader[j]
        }
        cur += fheader.length
        for (let j = 0; j < newdata.length; j++) {
            ret[cur+j] = newdata[j]
        }
        cur += newdata.length
        let curInOriginal = this.localheaderoffset + this.localheaderfulllength + this.filesize
        for (let j = 0; j < (this.centralDirectoryFileHeaderOffset - curInOriginal); j++) {
            ret[cur+j] = this.data[curInOriginal+j]
        }
        cur += (this.centralDirectoryFileHeaderOffset - curInOriginal)
        let fheader2 = this.data.slice(this.centralDirectoryFileHeaderOffset, this.centralDirectoryFileHeaderOffset + 0x2e)
        for (let i = 0; i < 12; i++) {
            fheader2[0x10 + i] = fheader[0x0e + i]
        }
        for (let j = 0; j < fheader2.length; j++) {
            ret[cur+j] = fheader2[j]
        }
        cur += fheader2.length
        curInOriginal = this.centralDirectoryFileHeaderOffset + 0x2e
        for (let j = 0; (curInOriginal+j) < this.filesSectionLengthOffset; j++) {
            ret[cur+j] = this.data[curInOriginal+j]
        }
        cur += (this.filesSectionLengthOffset - curInOriginal)
        let filesSectionLengthArr = this.data.slice(this.filesSectionLengthOffset, this.filesSectionLengthOffset+4)
        let origLength = (filesSectionLengthArr[0]      ) +
                         (filesSectionLengthArr[1] <<  8) +
                         (filesSectionLengthArr[2] << 16) +
                         (filesSectionLengthArr[3] << 24)
        let newLength = origLength - this.filesize + newdata.length
        filesSectionLengthArr[0] = (newLength       ) & 0xff
        filesSectionLengthArr[1] = (newLength >>>  8) & 0xff
        filesSectionLengthArr[2] = (newLength >>> 16) & 0xff
        filesSectionLengthArr[3] = (newLength >>> 24) & 0xff
        for (let j = 0; j < filesSectionLengthArr.length; j++) {
            ret[cur+j] = filesSectionLengthArr[j]
        }
        cur += filesSectionLengthArr.length
        curInOriginal = this.filesSectionLengthOffset + 4
        for (let j = 0; (curInOriginal+j) < this.data.length; j++) {
            ret[cur+j] = this.data[curInOriginal+j]
        }
        return ret
    }
}

let g_crctable = null

function crc32(data) {
    if (g_crctable === null) {
        g_crctable = []
        for (let i = 0; i < 256; i++) {
            let code = i
            for (let j = 0; j < 8; j++) {
                if ((code & 0x01) != 0) {
                    code = 0xEDB88320 ^ (code >>> 1)
                } else {
                    code = code >>> 1
                }
            }
            g_crctable.push(code)
        }
    }

    let crc = -1
    for (let i = 0; i < data.length; i++) {
        crc = g_crctable[(data[i] ^ crc) & 0xff] ^ [crc >>> 8]
    }
    return (-1 ^ crc) >>> 0 // >>> 0: convert to unsigned 32-bit
}

// allows reading and live modification of a bsdiff file - though live modification is untested
class bsdiff {
    constructor(data) {
        this.data = data
        this.name = 'bsdiff'
    }

    initializeForFullOverwrite(romhackBytes) { // alternative bsdiff which is not a diff at all, but raw new data for file replacement
        this.chunks = [{source: 'write', outputaddress: 0, length: romhackBytes.length, data: romhackBytes}]
    }

    processInitialDiff() {
        // https://openpreservation.org/system/files/bsdiff-4.0-documentation-colin-percival-bsd-licensed.pdf
        // these ints are 64-bit, but let's be reasonable and just do 4GB max compressed size lol
        let controlSize = (this.data[ 8]      ) +
                          (this.data[ 9] <<  8) +
                          (this.data[10] << 16) +
                          (this.data[11] << 24)
        let diffSize =    (this.data[16]      ) +
                          (this.data[17] <<  8) +
                          (this.data[18] << 16) +
                          (this.data[19] << 24)
        let controlBytes = module_compressjs.Bzip2.decompressFile(this.data.slice(32, 32 + controlSize))
        this.diffBytes =   module_compressjs.Bzip2.decompressFile(this.data.slice(32 + controlSize, 32 + controlSize + diffSize))
        this.extraBytes =  module_compressjs.Bzip2.decompressFile(this.data.slice(32 + controlSize + diffSize, this.data.length))
        let readptr = 0
        let diffptr = 0
        let extraptr = 0
        let outptr = 0
        this.chunks = []
        for (let i = 0; i < controlBytes.length; i += 24) {
            // again let's limit to 32-bit rather than 64-bit ints (but note sign in the 64th bit for seek)
            let mixlen =  (controlBytes[i   ]      ) +
                          (controlBytes[i+ 1] <<  8) +
                          (controlBytes[i+ 2] << 16) +
                          (controlBytes[i+ 3] << 24)
            let copylen = (controlBytes[i+ 8]      ) +
                          (controlBytes[i+ 9] <<  8) +
                          (controlBytes[i+10] << 16) +
                          (controlBytes[i+11] << 24)
            let seeklen = (controlBytes[i+16]      ) +
                          (controlBytes[i+17] <<  8) +
                          (controlBytes[i+18] << 16) +
                          (controlBytes[i+19] << 24)
            if ((controlBytes[i+23] & 0x80) != 0) {
                // sign is negative, convert from sign-and-magnitude representation (bsdiff does NOT use the more typical two's complement negative representation)
                seeklen = -seeklen
            }
            if (mixlen != 0) {
                this.chunks.push({source: 'mix', outputaddress: outptr, length: mixlen, readptr: readptr, diffptr: diffptr})
                readptr += mixlen
                diffptr += mixlen
                outptr  += mixlen
            }
            if (copylen != 0) {
                this.chunks.push({source: 'extra', outputaddress: outptr, length: copylen, extraptr: extraptr})
                extraptr += copylen
                outptr   += copylen
            }
            if (seeklen != 0) {
                readptr += seeklen
            }
        }
    }

    expandtosize(newsize, fillbyte) {
        let currentlength = this.chunks[this.chunks.length-1].outputaddress + this.chunks[this.chunks.length-1].length
        const /* in size */ expansion = new Uint8Array(newsize - currentlength)
        for (let i=0; i<expansion.length; i++) {
            expansion[i] = fillbyte
        }
        this.chunks.push({source: 'write', outputaddress: currentlength, length: expansion.length, data: expansion})
    }

    binarysearch(outputaddress) {
        let lowerbound = 0
        let upperbound = this.chunks.length
        let i
        do {
            i = Math.floor((lowerbound + upperbound) / 2)
            if (outputaddress < this.chunks[i].outputaddress) {
                upperbound = i
            } else {
                lowerbound = i + 1 // if i is correct, we're about to break out anyway
            }
        } while (!(this.chunks[i].outputaddress <= outputaddress &&
                                                   outputaddress < this.chunks[i].outputaddress + this.chunks[i].length))
        return i
    }

    updatetoadjacentchunk(i, outputaddress) {
        let j = 0
        for (j = i-1; 0 <= j && j <= i+2 && j < this.chunks.length; j++) {
            if (this.chunks[j].outputaddress <= outputaddress &&
                                                outputaddress < this.chunks[j].outputaddress + this.chunks[j].length) {
                break
            }
        }
        return j
    }

    read({bufferAtThisAddress, baseFile, fallbackBaseFile}, outputaddress, length) {
        let ret = []
        let i = this.binarysearch(outputaddress)
        let offsetinchunk = outputaddress - this.chunks[i].outputaddress
        let readbuffer
        if (bufferAtThisAddress != null) {
            readbuffer = bufferAtThisAddress
        } else {
            readbuffer = baseFile // full file access
        }
        while (ret.length < length) {
            let chunklimit = outputaddress + length
            if (chunklimit > this.chunks[i].outputaddress + this.chunks[i].length) {
                chunklimit = this.chunks[i].outputaddress + this.chunks[i].length
            }
            if (this.chunks[i].source == 'write') {
                for (let j = offsetinchunk; j + this.chunks[i].outputaddress < chunklimit; j++) {
                    ret.push(this.chunks[i].data[j]) // too large to push(...slice()) - stack overflows
                }
            } else if (this.chunks[i].source == 'mix') {
                let diffstart = this.chunks[i].diffptr + offsetinchunk
                let readstart
                if (bufferAtThisAddress != null) {
                    if (this.chunks[i].readptr == this.chunks[i].outputaddress) {
                        readbuffer = bufferAtThisAddress
                        readstart = ret.length
                    } else {
                        readbuffer = fallbackBaseFile
                        readstart = this.chunks[i].readptr + offsetinchunk
                        console.log('warning: readptr 0x' + this.chunks[i].readptr.toString(16) +
                                    ' differs from target address 0x' + this.chunks[i].outputaddress.toString(16) +
                                    ' (chunk ' + i + '), ignoring bufferAtThisAddress and falling back' +
                                    ' on fallbackBaseFile which may be wrong')
                        if (fallbackBaseFile == null) {
                            console.log('error: fallbackBaseFile is null!')
                        }
                    }
                } else {
                    if (this.chunks[i].readptr != this.chunks[i].outputaddress) {
                        console.log('warning: readptr 0x' + this.chunks[i].readptr.toString(16) +
                                    ' differs from target address 0x' + this.chunks[i].outputaddress.toString(16) +
                                    ' (chunk ' + i + '), baseFile data is being read in a possibly unexpected location')
                    }
                    readstart = this.chunks[i].readptr + offsetinchunk
                }
                for (let j = 0; j + offsetinchunk + this.chunks[i].outputaddress < chunklimit; j++) {
                    // mix
                    ret.push((readbuffer[readstart + j] + this.diffBytes[diffstart + j]) & 0xff)
                }
            } else if (this.chunks[i].source == 'extra') {
                let extrastart = this.chunks[i].extraptr + offsetinchunk
                for (let j = 0; j + offsetinchunk + this.chunks[i].outputaddress < chunklimit; j++) {
                    ret.push(this.extraBytes[extrastart + j])
                }
            }
            offsetinchunk = 0
            i = this.updatetoadjacentchunk(i, this.chunks[i].outputaddress + this.chunks[i].length)
        }
        return ret
    }

    overwrite(outputaddress, data) {
        let i = this.binarysearch(outputaddress)
        let position = 0
        while(position != data.length) {
            let chunklimit = this.chunks[i].outputaddress + this.chunks[i].length
            if (outputaddress + data.length < chunklimit) {
                chunklimit = outputaddress + data.length
            }
            // no merging chunks, just overwrite existing chunks and split if needed
            this.overwritetochunk(i, outputaddress+position, data.slice(position, chunklimit - (outputaddress + position)))
            position = chunklimit - outputaddress
            i = this.updatetoadjacentchunk(i, outputaddress + position)
        }
    }
    overwritetochunk(i, outputaddress, data) {
        if (this.chunks[i].source == 'write') {
            // overwrite part of existing 'write' chunk
            let newarr = []
            let startPosInChunkData = outputaddress - this.chunks[i].outputaddress
            for (let position = 0;
                 position < data.length && (position + startPosInChunkData) < this.chunks[i].length;
                 position++) {
                this.chunks[i].data[position + startPosInChunkData] = data[position]
            }
        } else if (outputaddress == this.chunks[i].outputaddress) {
            // overwrite beginning of a chunk => 1 new chunk
            this.chunks.splice(i, 0, {source: 'write', length: data.length, outputaddress: outputaddress, data: data})
            i++
            this.chunks[i].length -= data.length // .length == 0 is allowed
            if (this.chunks[i].source == 'mix') {
                this.chunks[i].readptr += data.length // skip bytes
                this.chunks[i].diffptr += data.length // skip bytes
            } else { // 'extra'
                this.chunks[i].extraptr += data.length // skip bytes
            }
        } else if (ouptputaddress + data.length == this.chunks[i].outputaddress + this.chunks[i].data.length) {
            // overwrite end of a chunk => 1 new chunk
            this.chunks.splice(i+1, 0, {source: 'write', length: data.length, outputaddress: outputaddress, data: data})
            this.chunks[i].length -= data.length
        } else {
            // overwrite the middle of a chunk => 2 new chunks
            let splitfinalchunklength = (this.chunks[i].outputaddress + this.chunks[i].length) - (outputaddress + data.length)
            this.chunks.splice(i+1, 0, {source: 'write', outputaddress: outputaddress, length: data.length, data: data})
            this.chunks[i].length = outputaddress - this.chunks[i].outputaddress
            if (this.chunks[i].source == 'mix') {
                this.chunks.splice(i+2, 0, {source: 'mix',
                                            outputaddress: outputaddress + data.length, 
                                            length: splitfinalchunklength,
                                            readptr: this.chunks[i].readptr + this.chunks[i].length + data.length,
                                            diffptr: this.chunks[i].diffptr + this.chunks[i].length + data.length})
            } else { // 'extra'
                this.chunks.splice(i+2, 0, {source: 'mix',
                                            outputaddress: outputaddress + data.length, 
                                            length: splitfinalchunklength,
                                            extraptr: this.chunks[i].extraptr + this.chunks[i].length + data.length})
            }
        }
    }

    repack() {
        let extradata = []
        let mixdata = []
        let control = []
        let c = {mixlen: 0, copylen: 0, seeklen: 0}
        let endoflastread = 0
        let totaloutput = 0
        for (const chunk of this.chunks) {
            if (chunk.length != 0) { // ignore chunk length of 0 (but allow it)
                if (chunk.source == 'write' || chunk.source == 'extra') {
                    if (chunk.source == 'write') {
                        for (let j = 0; j < chunk.data.length; j++) {
                            extradata.push(chunk.data[j]) // too large to push(...chunk.data) - stack overflows
                        }
                    } else { // 'extra'
                        for (let j = chunk.extraptr; j < chunk.extraptr.length; j++) {
                            extradata.push(this.extraBytes[j])
                        }
                    }
                    if (c.copylen != 0) {
                        control.push(c)
                        c = {mixlen: 0, copylen: 0, seeklen: 0}
                    }
                    totaloutput += chunk.length
                    c.copylen = chunk.length
                } else if (chunk.source == 'mix') {
                    for (let j = chunk.diffptr; j < chunk.diffptr + chunk.length; j++) {
                        mixdata.push(this.diffBytes[j])
                    }
                    c.seeklen = chunk.readptr - endoflastread
                    control.push(c)
                    c = {mixlen: 0, copylen: 0, seeklen: 0}
                    endoflastread = chunk.readptr + chunk.length
                    totaloutput += chunk.length
                    c.mixlen = chunk.length
                }
            }
        }
        if (c.mixlen != 0 || c.copylen != 0) {
            control.push(c)
        }
        // convert control to binary. again, limiting to 32-bit
        const /* in size */ controlBytes = new Uint8Array(control.length*24)
        let i = 0
        for (const block of control) {
            controlBytes[i   ] = (block.mixlen       ) & 0xff
            controlBytes[i+ 1] = (block.mixlen  >>  8) & 0xff
            controlBytes[i+ 2] = (block.mixlen  >> 16) & 0xff
            controlBytes[i+ 3] = (block.mixlen  >> 24) & 0xff
            controlBytes[i+ 8] = (block.copylen      ) & 0xff
            controlBytes[i+ 9] = (block.copylen >>  8) & 0xff
            controlBytes[i+10] = (block.copylen >> 16) & 0xff
            controlBytes[i+11] = (block.copylen >> 24) & 0xff
            let seek = block.seeklen
            let sign = 0
            if (seek < 0) {
                // for sign-and-magnitude representation
                seek = -block.seeklen
                sign = 1
            }
            controlBytes[i+16] = (seek               ) & 0xff
            controlBytes[i+17] = (seek          >>  8) & 0xff
            controlBytes[i+18] = (seek          >> 16) & 0xff
            controlBytes[i+19] = (seek          >> 24) & 0xff
            controlBytes[i+23] = sign ? 0x80 : 0x00
            i += 24
        }
        let bzip0 = module_compressjs.Bzip2.compressFile(controlBytes)
        let bzip1 = module_compressjs.Bzip2.compressFile(mixdata)
        let bzip2 = module_compressjs.Bzip2.compressFile(extradata)
        const /* in length */ bsdiff = new Uint8Array(32 + bzip0.length + bzip1.length + bzip2.length)
        let sig = 'BSDIFF40'
        for (let j = 0; j < 8; j++) {
            bsdiff[j] = sig.charCodeAt(j)
        }
        bsdiff[ 8] = (bzip0.length      ) & 0xff
        bsdiff[ 9] = (bzip0.length >>  8) & 0xff
        bsdiff[10] = (bzip0.length >> 16) & 0xff
        bsdiff[11] = (bzip0.length >> 24) & 0xff
        bsdiff[16] = (bzip1.length      ) & 0xff
        bsdiff[17] = (bzip1.length >>  8) & 0xff
        bsdiff[18] = (bzip1.length >> 16) & 0xff
        bsdiff[19] = (bzip1.length >> 24) & 0xff
        bsdiff[24] = (totaloutput       ) & 0xff
        bsdiff[25] = (totaloutput  >>  8) & 0xff
        bsdiff[26] = (totaloutput  >> 16) & 0xff
        bsdiff[27] = (totaloutput  >> 24) & 0xff
        let start = 32
        for(let j = 0; j < bzip0.length; j++) {
            bsdiff[start+j] = bzip0[j]
        }
        start += bzip0.length
        for(let j = 0; j < bzip1.length; j++) {
            bsdiff[start+j] = bzip1[j]
        }
        start += bzip1.length
        for(let j = 0; j < bzip2.length; j++) {
            bsdiff[start+j] = bzip2[j]
        }
        return bsdiff
    }
}
