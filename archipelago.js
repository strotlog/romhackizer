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
        archipelagomagic: function(apsm,
                                   modifications /* note, order is important in case of overlaps */,
                                   vanillaSm,
                                   offsetsInRomOf100ItemPlms,
                                   hackname,
                                   itemRemapping,
                                   itemMapping) {
            ap = new archipelagoclass(apsm, modifications, vanillaSm, offsetsInRomOf100ItemPlms, hackname, itemRemapping, itemMapping)
            this.ap = ap
            ap.extractApsmData()
            ap.expandRom()
            ap.applyModifications()
            ap.copy100PlmsAndNothings()
            ap.copyLimitedApsmData()
            return ap.copyRandoToZip()
        },
    }
})

class archipelagoclass {
    constructor(apsm,
                modifications,
                vanillaSm,
                offsetsInRomOf100ItemPlms,
                hackname,
                itemRemapping,
                itemMapping) {

        this.apsm = apsm
        this.modifications = modifications
        this.vanillaSm = vanillaSm
        this.offsetsInRomOf100ItemPlms = offsetsInRomOf100ItemPlms
        this.hackname = hackname
        this.itemRemapping = itemRemapping
        this.itemMapping = itemMapping
        this.name = 'archipelago'
        this.zip = new zipfile0(this.apsm, "delta.bsdiff4")
    }

    extractApsmData() {
        let bsfile = this.zip.extract()
        this.bsdiff_from_ap = new bsdiff(bsfile)
        this.bsdiff_from_ap.processInitialDiff()
        this.bsdiff_apromhacked = new bsdiff([])
        this.bsdiff_apromhacked.initializeFromSharedOriginalFile(this.vanillaSm)
    }

    expandRom() {
        if (this.hackname == 'rotation') {
            this.bsdiff_apromhacked.expandtosize(romSize_Rotation, 0xff)
        } else if (this.hackname == 'otherRotation') {
            this.bsdiff_apromhacked.expandtosize(romSize_otherRotation, 0xff)
        } else if (this.hackname == 'zfactor') {
            this.bsdiff_apromhacked.expandtosize(romSize_Zfactor, 0xff)
        } else {
            console.log('unknown hackname "' + this.hackname + '" in expandRom')
        }
    }

    getHiddenness(plmid) {
        // given a vanilla PLM id such as 0xef13 "plasma, visible", return whether it is
        // 'visible', 'chozo', 'hidden', or 'unknown'
        // does not handle archipelago PLM ids, nor some varia rando-specific PLM ids
        let hiddenstate
        if        (0xeed7 <= plmid &&
                             plmid <= 0xef27) {
            hiddenstate = 'visible'
        } else if (0xef2b <= plmid &&
                             plmid <= 0xef7b) {
            hiddenstate = 'chozo'
        } else if (0xef7f <= plmid &&
                             plmid <= 0xefcf) {
            hiddenstate = 'hidden'
        } else if (plmid == 0xbaed || plmid == 0xbad5) {
            // 0xbaed varia items are hidden, but NOTE cannot guess whether 0xbae9/0xbad1 varia item is visible vs chozo
            // but this probably isn't neeeded anyway
            hiddenstate = 'hidden'
        } else {
            hiddenstate = 'unknown'
        }
        return hiddenstate
    }

    copy100PlmsAndNothings() {
        let ap_inferredplms = {}
        let romhack_ap_plms = {}
        if (this.itemMapping != null) {
            if (this.hackname == 'zfactor') {
                romhack_ap_plms['visible'] = parseInt('0x' + visiblePlm_Zfactor['new'].split(':')[1])
                romhack_ap_plms['chozo'] = romhack_ap_plms['visible'] + 4
                romhack_ap_plms['hidden'] = romhack_ap_plms['visible'] + 8
            } else {
                console.log('warning: hack \'' + this.hackname + '\' does not have a visible-item-PLM symbol in js, assuming same PLM ID as regular AP\'s')
            }
            // to make useful future inferences about the hidden-ness level of romhack's original items,
            // we must first infer the hidden-ness level associated with each archipelago item
            let counts = {}
            this.offsetsInRomOf100ItemPlms.map(
                (address) => this.bsdiff_from_ap.read(this.vanillaSm, address, 2)).map(
                (twobytes) => twobytes[0] + twobytes[1]*256).filter(
                (ap_plm) => ap_plm != 0xbae9 && ap_plm != 0xbaed && ap_plm != 0xbad1 && ap_plm != 0xbad5 /* remove 'nothing' items */).forEach(
                function (ap_plm) {
                    if (!(ap_plm in counts)) {
                        counts[ap_plm] = 0
                    }
                    counts[ap_plm]++
                })
            // note: keys are strings (base 10 representation)
            let max_count = Math.max(...Object.keys(counts).map((ap_plm) => counts[ap_plm]))
            let most_used_plm = parseInt(Object.keys(counts).filter((ap_plm) => counts[ap_plm] == max_count)[0]) // arbitrary tiebreak
            // order is: visible, chozo, hidden
            // e.g. $f870: visible plm definition (any item)
            //      $f874: chozo plm definition (any item)
            //      $f878: hidden plm definition (any item)
            // but the absolute position isn't super fixed, hence all this we've done right here
            let visibleplm = 0
            if (most_used_plm - 4 in counts && most_used_plm - 8 in counts) {
                visibleplm = most_used_plm - 8
            } else if (most_used_plm - 4 in counts && most_used_plm + 4 in counts) {
                visibleplm = most_used_plm - 4
            } else if (most_used_plm + 4 in counts && most_used_plm + 8 in counts) {
                visibleplm = most_used_plm
            }
            if (visibleplm != 0) {
                ap_inferredplms['visible'] = visibleplm
                ap_inferredplms['chozo'] = visibleplm + 4
                ap_inferredplms['hidden'] = visibleplm + 8
                // map the reverse too (key is in base 10 representation)
                ap_inferredplms[visibleplm    ] = 'visible'
                ap_inferredplms[visibleplm + 4] = 'chozo'
                ap_inferredplms[visibleplm + 8] = 'hidden'
                console.log('vanilla ap is using visible plm at $84:'+visibleplm.toString(16))
                if (Object.keys(romhack_ap_plms).length == 0) {
                    // assume same PLM IDs (warning emitted above)
                    romhack_ap_plms['visible'] = ap_inferred_plms['visible']
                    romhack_ap_plms['chozo'  ] = ap_inferred_plms['chozo'  ]
                    romhack_ap_plms['hidden' ] = ap_inferred_plms['hidden' ]
                }
            } else {
                console.log('warning: did not find 2 adjacent PLMs to ap\'s most_used_plm of 0x' + most_used_plm.toString(16) + ' (count = ' + max_count + '). counts = ' + JSON.stringify(counts))
            }
        }
        for (const address of this.offsetsInRomOf100ItemPlms) {
            let apPlmIdBytes = this.bsdiff_from_ap.read(this.vanillaSm /* basis of the bsdiff */, address, 2) // read from AP
            let apPlmId = apPlmIdBytes[0] + apPlmIdBytes[1]*256
            if (this.itemMapping == null) {
                let newaddress = address // all item locations are the same
                if (this.itemRemapping != null && ('0x' + address.toString(16)) in this.itemRemapping) { // ... except if they're not (5 known instances ever)
                    newaddress = parseInt(this.itemRemapping['0x' + address.toString(16)])
                }
                // see patchmain in other file for comments detailing PLM codes
                if (apPlmId == 0xbae9 || apPlmId == 0xbad1) {
                    // 'nothing' chozo or 'nothing' in the open PLM (convert varia PLM 0xbae9/0xbad1 -> hacky empty PLM 0xe0df)
                    this.bsdiff_apromhacked.overwrite(newaddress, [0xdf, 0xe0])
                } else if (apPlmId == 0xbaed || apPlmId == 0xbad5) {
                    // 'nothing' hidden PLM (convert varia PLM 0xbaed/0xbad5 -> hackery achieving the same thing)
                    this.bsdiff_apromhacked.overwrite(newaddress, [0x83, 0xef]) // missile shot block PLM 0xef83
                    this.bsdiff_apromhacked.overwrite(newaddress+4, [0x20, 0x05]) // 0x0520 hackery to avoid new PLM (see patchmain comments)
                } else {
                    // main overwrite!
                    let romhackPlmId
                    if (this.hackname == 'rotation') {
                        romhackPlmId = apPlmId + visiblePlmDifference_Rotation
                    } else if (this.hackname == 'otherRotation') {
                        romhackPlmId = apPlmId + visiblePlmDifference_otherRotation
                    } else {
                        console.log('Error: don\'t have a vanilla->romhack plm id translation for hackname \'' + this.hackname + '\'')
                        return
                    }
                    this.bsdiff_apromhacked.overwrite(newaddress, [romhackPlmId % 256, Math.floor(romhackPlmId / 256)])
                }
            } else {
                // convert vanilla item locations to romhack item locations
                let newaddress = parseInt(this.itemMapping.fromAp['0x' + address.toString(16)])
                let romhackOrigPlmBytes = this.bsdiff_apromhacked.read(this.vanillaSm, newaddress, 2)
                let romhackOrigPlm = romhackOrigPlmBytes[0] + romhackOrigPlmBytes[1]*256
                // get the hidden-ness level of the romhack's original item (must do this before overwriting the PLM)
                // if romhack uses original item PLMs, as we expect, they will fall in the vanilla range and are known easily
                let hiddenstate = this.getHiddenness(romhackOrigPlm)
                if (hiddenstate == 'unknown') {
                    console.log('Error: failed to grok romhack PLM id 0x' + romhackOrigPlm.toString(16) + ' @ ROM file address 0x' + newaddress.toString(16) + '. need to know if this is originally a visible/chozo/hidden item in the base romhack!')
                    return
                }

                if (apPlmId == 0xbae9 || apPlmId == 0xbad1 || apPlmId == 0xbaed || apPlmId == 0xbad5) {
                    // we want to copy a 'nothing' item
                    // we don't care which type of 'nothing' AP tells us, since that depends only on whether the vanilla/AP location is hidden or not -
                    // rather, we care whether the *romhack* location is hidden or not
                    if (hiddenstate == 'hidden') {
                        // place a 'nothing' hidden PLM
                        this.bsdiff_apromhacked.overwrite(newaddress, [0x83, 0xef]) // missile shot block PLM 0xef83
                        this.bsdiff_apromhacked.overwrite(newaddress+4, [0x20, 0x05]) // 0x0520 hackery to avoid new PLM (see patchmain comments)
                    } else {
                        // place a 'nothing' visible or chozo PLM
                        this.bsdiff_apromhacked.overwrite(newaddress, [0xdf, 0xe0]) // hacky empty PLM 0xe0df
                    }
                } else if (apPlmId == 0) {
                    console.log('Error: we read PLM value of 0 (should be a ROM pointer) @ AP rom offset 0x' + address.toString(16))
                    return
                } else if(apPlmId in ap_inferredplms) {
                    // this appears to be a non-nothing AP item PLM we're trying to move over, so we can discard the PLM ID,
                    // instead using whichever new AP PLM preserves the hiddenness of the original romhack item
                    this.bsdiff_apromhacked.overwrite(newaddress, [(romhack_ap_plms[hiddenstate]     ) & 0xff,
                                                                   (romhack_ap_plms[hiddenstate] >> 8) & 0xff])
                    // also, since this is a non-nothing item that all the AP MW item PLM code must look
                    // up in the item location table, we must copy the correct location identifier into
                    // the PLM's "room argument". this is what actually propagates up the vanilla item
                    // type (such as reserve tank), as well as propagating a unique item save bit location,
                    // to this specific item in the romhack
                    // (this operation is not needed for very vanilla-like romhacks as they rarely
                    //  modify location ids, along with their not modifying room PLM rom offsets)
                    let locationidBytes = this.bsdiff_from_ap.read(this.vanillaSm, address + 4, 2)
                    this.bsdiff_apromhacked.overwrite(newaddress + 4, locationidBytes)
                } else {
                    console.log('warning: failed to infer hidden-ness of romhack orig PLM 0x' + romhackOrigPlm.toString(16) + ' @ ROM file address 0x' + newaddress.toString(16) + '. copying PLM 0x' + apPlmId.toString(16) + ' directly from AP')
                    if (ap_inferredplms['visible'] != romhack_ap_plms['visible']) {
                        console.log('  -- additional warning: romhack ap plms differ from original ap plms, this rom is *very likely* to crash!')
                    }
                    this.bsdiff_apromhacked.overwrite(newaddress, plm)
                }
            }
        }
        // if the romhack has 110 items, we need to change 10 of them very subtly (or N-100).
        // all 110 items have a unique number pointing to the SRAM bit that is theirs and theirs alone.
        // this number is called 'location id'.
        // AP does not modify this number (although it indexes a lot of basic things off it, unlike vanilla)
        // luckily SM has hundreds of unused bits in the bit array;
        // we just need to select location ids we think are unused for each of the N-100 extra items!
        if (this.itemMapping != null) {
            if (this.itemMapping.leaveAsRegularItem.length > (127-90+1)) {
                console.log('error: romhack has too many extra location IDs for current implementation ('
                            + this.itemmapping.leaveAsRegularItem.length + '). add a new range to this code!')
            }
            for (let i = 0; i < this.itemMapping.leaveAsRegularItem.length; i++) {
                let address = parseInt(this.itemMapping.leaveAsRegularItem[i])
                // sm does not use 0n90-0n127, inclusive
                let locationId = 90+i
                // location id is technically 2 bytes at offset plm+4 and plm+5, but as long as id's are under 256 we can leave plm+5 as 0
                this.bsdiff_apromhacked.overwrite(address + 4, [locationId])
            }
        }
    }

    applyModifications() {
        for (const modification of this.modifications.flat() /* flat: allow caller to specify as array of arrays */) {
            this.bsdiff_apromhacked.overwrite(modification.address, modification.bytes)
        }
    }

    copyLimitedApsmData() {
        let table = null
        if (this.hackname == 'rotation') {
            table = copyFromMultiWorldTo_Rotation
        } else if (this.hackname == 'otherRotation') {
            table = copyFromMultiWorldTo_otherRotation
        } else if (this.hackname == 'zfactor') {
            table = copyFromMultiWorldTo_Zfactor
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
            let data = this.bsdiff_from_ap.read(this.vanillaSm, romOffsetFromSnesAddrString(entry.old), entry.length)
            this.bsdiff_apromhacked.overwrite(romOffsetFromSnesAddrString(entry.new), data)
        }
        let playerIdTarget = table.find((e) => e.symbol == "config_player_id").new
        let playerIdBytes = this.bsdiff_apromhacked.read(this.vanillaSm, romOffsetFromSnesAddrString(playerIdTarget), 2)
        if (playerIdBytes[0] == 0xFF && playerIdBytes[1] == 0xFF) { // AP versions pre-0.3.4 have no player ID in config, handle this case via parsing id number from title (but now that 0.3.4+ is released and running, this is essentially dead code)
            let titlebytes = this.bsdiff_apromhacked.read(this.vanillaSm, 0x7fc0, 21)
            let title = (new TextDecoder(/* default utf-8, will work */)).decode(new Uint8Array(titlebytes))
            let match = /^SM\d+_(\d+)_/.exec(title)
            let playerid = parseInt(match[1])
            console.log("workaround versioning issues: adding config_player_id manually (detected player " + playerid + ")")
            this.bsdiff_apromhacked.overwrite(romOffsetFromSnesAddrString(playerIdTarget),
                                              [playerid & 0xff, (playerid >> 8) & 0xff])
        }
    }

    copyRandoToZip() {
        return this.zip.replacefile(this.bsdiff_apromhacked.repack())
    }

}

// data:

romSize_Rotation = 3*1024*1024 /* 3MiB vanilla */ + 4*0x8000 // go 4 banks beyond vanilla end: 2 new banks ($E0, $E1) for vanilla-rotation, +2 new banks ($E2, $E3) for multiworld

// things chosen to copy based on archipelago's worlds/sm/__init__.py: specifically, the symbols it uses to write generated AP data to the ROM
// then values are from https://github.com/strotlog/SMBasepatch/tree/<branch>/build/rotation/sm-basepatch-symbols.json
//  ^ TODO: auto parse jsons from githubusercontent to get the new+old (ie to+from) addresses, instead of hard coding here
copyFromMultiWorldTo_Rotation = [
    {"symbol" : "message_item_names", "new": "85:9963", "old": "85:9963", "length": 7744, vanilla : 0xFF },
    {"symbol" : "rando_item_table", "new": "E2:E000", "old": "B8:E000", "length": 4096, vanilla: 0xFF },
    {"symbol" : "offworld_graphics_data_progression_item", "new": "89:9100", "old": "89:9100", "length": 256, vanilla: 0x00 },
    {"symbol" : "offworld_graphics_data_item", "new": "89:9200", "old": "89:9200", "length": 256, vanilla: 0x00 },
    {"symbol" : "prog_item_eight_palette_indices", "new": "84:F87E", "old": "84:FC2E", "length": 8, vanilla: 0xFF },
    {"symbol" : "nonprog_item_eight_palette_indices", "new": "84:F888", "old": "84:FC38", "length": 8, vanilla: 0xFF },
    {"symbol" : "config_deathlink", "new": "CE:FF04", "old": "CE:FF04", "length": 1, vanilla: 0xFF },
    {"symbol" : "config_remote_items", "new": "CE:FF06", "old": "CE:FF06", "length": 1, vanilla: 0xFF },
    {"symbol" : "config_player_id", "new": "CE:FF08", "old": "CE:FF08", "length": 2, vanilla: [0xFF, 0xFF] },
    {"symbol" : "rando_player_name_table", "new": "E2:D000", "old": "B8:D000", "length": 3216, vanilla: 0xFF },
    {"symbol" : "rando_player_id_table", "new": "E2:DCA0", "old": "B8:DCA0", "length": 402, vanilla: 0xFF },
    {"symbol" : "snes_header_game_title", "new": "80:FFC0", "old": "80:FFC0", "length": 21, vanilla: 'Super Metroid'.padEnd(21, ' ')},
    {"symbol" : "start_item_data_major", "new": "E2:C800", "old": "B8:C800", "length": 8, vanilla: 0xFF },
    {"symbol" : "start_item_data_minor", "new": "E2:C808", "old": "B8:C808", "length": 16, vanilla: 0xFF },
    {"symbol" : "start_item_data_reserve", "new": "E2:C818", "old": "B8:C818", "length": 4, vanilla: 0xFF },
]

romSize_otherRotation = 4*1024*1024 // 4MiB just for the romhack, no further expansion needed as free banks are included

copyFromMultiWorldTo_otherRotation = copyFromMultiWorldTo_Rotation // otherRotation can use the same multiworld basepatch as rotation, mainly in bank $e2, which is free

romSize_Zfactor = 3*1024*1024 /* 3MiB vanilla */ + 7*0x8000

copyFromMultiWorldTo_Zfactor = [
    {"symbol" : "message_item_names", "new": "85:9963", "old": "85:9963", "length": 7744, vanilla : 0xFF },
    {"symbol" : "rando_item_table", "new": "E5:E000", "old": "B8:E000", "length": 4096, vanilla: 0xFF },
    {"symbol" : "offworld_graphics_data_progression_item", "new": "89:9100", "old": "89:9100", "length": 256, vanilla: 0x00 },
    {"symbol" : "offworld_graphics_data_item", "new": "89:9200", "old": "89:9200", "length": 256, vanilla: 0x00 },
    {"symbol" : "prog_item_eight_palette_indices", "new": "84:FBCE", "old": "84:FC2E", "length": 8, vanilla: 0xFF },
    {"symbol" : "nonprog_item_eight_palette_indices", "new": "84:FBD8", "old": "84:FC38", "length": 8, vanilla: 0xFF },
    {"symbol" : "config_deathlink", "new": "CE:FF04", "old": "CE:FF04", "length": 1, vanilla: 0xFF },
    {"symbol" : "config_remote_items", "new": "CE:FF06", "old": "CE:FF06", "length": 1, vanilla: 0xFF },
    {"symbol" : "config_player_id", "new": "CE:FF08", "old": "CE:FF08", "length": 2, vanilla: [0xFF, 0xFF] },
    {"symbol" : "rando_player_name_table", "new": "E5:D000", "old": "B8:D000", "length": 3216, vanilla: 0xFF },
    {"symbol" : "rando_player_id_table", "new": "E5:DCA0", "old": "B8:DCA0", "length": 402, vanilla: 0xFF },
    {"symbol" : "snes_header_game_title", "new": "80:FFC0", "old": "80:FFC0", "length": 21, vanilla: 'Super Metroid'.padEnd(21, ' ')},
    {"symbol" : "start_item_data_major", "new": "E5:C800", "old": "B8:C800", "length": 8, vanilla: 0xFF },
    {"symbol" : "start_item_data_minor", "new": "E5:C808", "old": "B8:C808", "length": 16, vanilla: 0xFF },
    {"symbol" : "start_item_data_reserve", "new": "E5:C818", "old": "B8:C818", "length": 4, vanilla: 0xFF },
]

visiblePlm_Zfactor =
    { "symbol" : "archipelago_visible_item_plm", "new": "84:FBC0" }

// last symbol thing, again could be improved by reading json symbol data
visiblePlmDifference_Rotation = 0x84f870 - 0x84fc20 // ap rotation plm id minus ap vanilla plm id "84:f870" - "84:fc20"
visiblePlmDifference_otherRotation = visiblePlmDifference_Rotation

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
        crc = g_crctable[(data[i] ^ crc) & 0xff] ^ (crc >>> 8)
    }
    return (-1 ^ crc) >>> 0 // >>> 0: convert to unsigned 32-bit
}

// allows reading and live modification of a bsdiff file - though live modification is untested
class bsdiff {
    constructor(encodeddata) {
        this.encodeddata = encodeddata
        this.name = 'bsdiff'
    }

    processInitialDiff() {
        // https://openpreservation.org/system/files/bsdiff-4.0-documentation-colin-percival-bsd-licensed.pdf
        // these ints are 64-bit, but let's be reasonable and just do 4GB max compressed size lol
        let controlSize = (this.encodeddata[ 8]      ) +
                          (this.encodeddata[ 9] <<  8) +
                          (this.encodeddata[10] << 16) +
                          (this.encodeddata[11] << 24)
        let diffSize =    (this.encodeddata[16]      ) +
                          (this.encodeddata[17] <<  8) +
                          (this.encodeddata[18] << 16) +
                          (this.encodeddata[19] << 24)
        let controlBytes = module_compressjs.Bzip2.decompressFile(this.encodeddata.slice(32, 32 + controlSize))
        this.diffBytes =   module_compressjs.Bzip2.decompressFile(this.encodeddata.slice(32 + controlSize, 32 + controlSize + diffSize))
        this.extraBytes =  module_compressjs.Bzip2.decompressFile(this.encodeddata.slice(32 + controlSize + diffSize, this.encodeddata.length))
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

    // alternative init for a totally new patch (alternative to processInitialDiff())
    initializeFromSharedOriginalFile(vanillaBytes) {
        //this.chunks = [{source: 'write', outputaddress: 0, length: vanillaBytes.length, data: vanillaBytes}]
        this.diffBytes = new Uint8Array(vanillaBytes.length) // auto zero-initialized
        this.extraBytes = new Uint8Array(0)
        this.chunks = [{source: 'mix', outputaddress: 0, length: this.diffBytes.length, readptr: 0, diffptr: 0}]
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

    read(baseFile, outputaddress, length) {
        let ret = []
        let i = this.binarysearch(outputaddress)
        let offsetinchunk = outputaddress - this.chunks[i].outputaddress
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
                let readstart = this.chunks[i].readptr + offsetinchunk
                for (let j = 0; j + offsetinchunk + this.chunks[i].outputaddress < chunklimit; j++) {
                    // mix
                    ret.push((baseFile[readstart + j] + this.diffBytes[diffstart + j]) & 0xff)
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
            this.overwritetochunk(i, outputaddress+position, data.slice(position, chunklimit - outputaddress))
            position = chunklimit - outputaddress
            i = this.updatetoadjacentchunk(i, outputaddress + position)
        }
    }
    // helper function:
    overwritetochunk(i, outputaddress, data) {
        if (this.chunks[i].source == 'write') {
            // overwrite part of existing 'write' chunk
            let startPosInChunkData = outputaddress - this.chunks[i].outputaddress
            for (let position = 0;
                 position < data.length && (position + startPosInChunkData) < this.chunks[i].length;
                 position++) {
                this.chunks[i].data[position + startPosInChunkData] = data[position]
            }
        } else if (outputaddress == this.chunks[i].outputaddress) {
            // note, not implemented: exact replacement of a chunk. instead we'll just set the original chunk's length to 0 (which this class allows) and insert a new one. fewer code paths!
            // overwrite beginning of a chunk => 1 new chunk
            this.chunks.splice(i, 0, {source: 'write', length: data.length, outputaddress: outputaddress, data: data, createdby: 'beginchunk'})
            i++
            this.chunks[i].length -= data.length // .length == 0 is allowed
            if (this.chunks[i].source == 'mix') {
                this.chunks[i].readptr += data.length // skip bytes
                this.chunks[i].diffptr += data.length // skip bytes
                this.chunks[i].outputaddress += data.length // skip bytes
            } else { // 'extra'
                this.chunks[i].extraptr += data.length // skip bytes
                this.chunks[i].outputaddress += data.length // skip bytes
            }
        } else if (outputaddress + data.length == this.chunks[i].outputaddress + this.chunks[i].length) {
            // overwrite end of a chunk => 1 new chunk
            this.chunks.splice(i+1, 0, {source: 'write', length: data.length, outputaddress: outputaddress, data: data, createdby:'endofchunk'})
            this.chunks[i].length -= data.length
        } else {
            // overwrite the middle of a chunk => 2 new chunks
            let splitfinalchunklength = (this.chunks[i].outputaddress + this.chunks[i].length) - (outputaddress + data.length)
            this.chunks.splice(i+1, 0, {source: 'write', outputaddress: outputaddress, length: data.length, data: data, createdby:'midchunk' })
            this.chunks[i].length = outputaddress - this.chunks[i].outputaddress
            if (this.chunks[i].source == 'mix') {
                this.chunks.splice(i+2, 0, {source: 'mix',
                                            outputaddress: outputaddress + data.length,
                                            length: splitfinalchunklength,
                                            readptr: this.chunks[i].readptr + this.chunks[i].length + data.length,
                                            diffptr: this.chunks[i].diffptr + this.chunks[i].length + data.length,
                                            createdby: 'postmidchunk'})
            } else { // 'extra'
                this.chunks.splice(i+2, 0, {source: 'extra',
                                            outputaddress: outputaddress + data.length,
                                            length: splitfinalchunklength,
                                            extraptr: this.chunks[i].extraptr + this.chunks[i].length + data.length,
                                            createdby: 'postmidchunk'})
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
                            extradata.push(chunk.data[j]) // too large to push(...chunk.data) in one go without a loop - stack would overflow
                        }
                    } else { // 'extra'
                        for (let j = chunk.extraptr; j < chunk.extraptr + chunk.length; j++) {
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
