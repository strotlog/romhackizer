var romfeatures = {

// questionable solution because https://wiki.nesdev.org/w/index.php?title=Overscan
    maxAmmoDisplay: [
    {address: 0x01caa, type: 'overwrite', description: 'max ammo in pause menu',
    bytes: [
            // modify function "$80:9B44: Handle HUD tilemap (HUD routine when game is paused/running)" @ $80:9CAA
            'bra', 8, // skip the next 8 bytes, so that we can use them as jsl->jsr launchpads: very tiny functions which will let us call bank $80 local functions from within other code in other banks
            0x20 /* jsr */, [0x9d, 0x78].reverse(), // thus we can use "jsl $80:9CAC" to be able to call $80:9D78: "Draw three HUD digits"
            'rtl',
            0x20 /* jsr */, [0x9d, 0x98].reverse(), // thus we can use "jsl $80:9CB0" to be able to call $80:9D98: "Draw two HUD digits"
            'rtl',

            'jsl', [0x80, 0xd4, 0x00].reverse(), // long in case i need to repoint the main code (below) to live in a different bank than $80. (also why we have launchpads)
            'nop', // to avoid overwriting only half an instruction
            ].flat()},
    {address: 0x05400, type: 'freespace',
     bytes: [
             // new code at $80:d400:
             //   this is a wrapper function to ensure we always run the vanilla code without resorting to a jmp
             0x20 /* jsr */, [0xd4, 0x18].reverse(), // call $80:d418
             // vanilla code we overwrote
             0xAE, 0x30, 0x03, // LDX $0330
             0xA9, 0xC0, 0x00, // LDA #$00C0
             0x95, 0xD0,       // STA $D0,x
             0xE8,             // INX
             0xE8,             // INX
             0xA9, 0x08, 0xC6, // LDA #$C608
             0x95, 0xD0,       // STA $D0,x
             'rtl', // return
             ].flat()},
    {address: 0x05418, type: 'freespace',
     bytes: [
             // new code at $80:d418:
             // essentially, (1) entry of equipment screen? -> write max ammo on screen,
             //              (2) leaving the equipment screen (back to map screen or unpause) -> remove max ammo from screen
             // start by seeing exactly what state we are in.
             // this could have been simplified by simply hooking (1)+(2a)+(2b) mentioned above, but we'll just implement with a bunch of if's here,
             // in order to keep us flexible for displaying on a different screen in a future implementation.
             0xad /* lda load */, [0x09, 0x98].reverse(), // load $0998 : game state
             0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only
             0xc9 /* cmp imm */, [0x00, 0x08].reverse(), // $0998 (game state) == 0x8 (main gameplay)?
             'bne', 1, // skip rts if not equal
             'rts', // return first thing if we're in main gameplay!

             0xc9 /* cmp imm */, [0x00, 0x11].reverse(), // $0998 (game state) == 0x11 (exiting pause)?
             'bne', 4, // skip jsr:rts if not equal
             0x20 /* jsr */, [0xd5, 0x28].reverse(), // 0x11 (exiting pause) => call $80:d528 (check if we need to do cleanup and do so)
             'rts', // return after calling the cleanup check

             0xc9 /* cmp imm */, [0x00, 0x12].reverse(), // $0998 (game state) == 0x12 (exiting pause v2)?
             'bne', 4, // skip jsr:rts if not equal
             0x20 /* jsr */, [0xd5, 0x28].reverse(), // 0x12 (exiting pause v2) => call $80:d528 (check if we need to do cleanup and do so)
             'rts', // return after calling the cleanup check

             0xc9 /* cmp imm */, [0x00, 0x0f].reverse(), // $0998 (game state) == 0xf (paused)?
             'beq' /* branch if equal */, 1, // skip rts if yes (equal)
             'rts', // return if not paused
             // yes we are paused:

             0xad /* lda load */, [0x07, 0x27].reverse(), // load $0727 : pause screen state aka pause index.
             0xc9 /* cmp imm */, [0x00, 0x06].reverse(), // $0727 (pause screen state) == 6 (loading the map screen after having shown equipment screen)? we probably only get called once in this state this which is cool)
             'bne', 4, // skip jsr:rts if not equal
             0x20 /* jsr */, [0xd5, 0x28].reverse(), // 6 (loading the map screen after having shown equipment screen) => call $80:d528 (check if we need to do cleanup and do so)
             'rts', // return after calling the cleanup check

             0xc9 /* cmp imm */, [0x00, 0x03].reverse(), // $0727 (pause screen state) == 3 (loading the equipment screen)? we probably only get called once in this state this which is cool)
             'beq', 1, // skip rts if equal
             'rts', // return if not deep in a transition between pause screens

             // we are paused and on the equipment screen (pause screen state 1, 4, or 5)! do the thing! (draw max ammos - we'll do it kind of the way $80:9B44 draws current ammos)

             // for the new max ammo count digits: we need nine (9) 8px by 8px tiles (out of a full row of 32) in an abbreviated row above the ammo displays.
             // this spot is above where the game normally displays anything! so that part'll be a bit hacky.
             // we need a spot in RAM (WRAM) to set up the initial tile data (2 bytes per tile = 18 bytes) for a short amount of time, as we'll set up a DMA from RAM to VRAM to happen later.
             // RAM: let's write the 9 tiles to $7E:1F5C..1F6E - top of stack (2 bytes per tile for this stage.)
             //      - we'll verify there's enough room in the stack first. i don't really care if it gets clobbered, it's just graphics. but let's be careful not to overwrite our own return address with gfx!
             // VRAM: then we'll queue a DMA from there to VRAM $580A..5813 (sub-section of the blank/unused top row, $5800-$5820)

             'tsx', /* tsx ie set X=S */
             0xe0, /* cpx compare X to imm */, [0x1F, 0x8E].reverse(), // $7E:1F6E end of the space we want + 0x20 bytes for function calls and interrupts = $7E:1F8E
             'bcs', /* branch-(if)-carry-set, branch if the result was positive or 0 */, 1, // if enough stack space, skip rts
             'rts', // if not enough stack space, return

             // write blank tiles to the initial tile data before we write digit tiles over some of this memory, so everything starts at a valid default
             'phy', // push Y register
             0xa9,  [0x2c, 0x0f].reverse(),       // LDA #$2c0f (blank tile type)
             0xa2,  [0x1f, 0x5c].reverse(),       // LDX #$1f5c (starting address of (misappropriated) top of stack area)
             0xa0,  [0x00, 0x12].reverse(),       // LDY #$0012 (0x12=0n18=2 bytes for each of the 9 2c0f's to write at $1f5c)
             'jsl', [0x80, 0x83, 0xf6].reverse(), // JSL $80:83F6 ; Write [Y] bytes of [A] to $7E:0000 + [X] - 16-bit
             'ply', // pull to Y register

             // create initial tile data at $7E:1F5C..1F6E
             // the callees can only write to addresses higher than $C608 (yeah, i tried wrapping the bank, it went into bank $7f instead) sigh. so:
             // (1) backup tiles to $88..8e (temp storage, part of dp (direct page instruction-accessible) RAM <= 0xff)
             // (2) overwrite tiles with calc
             // (3) move calc'ed tiles to $7e:1F5C..1F6E
             // ... repeat (2) and (3) for supers and pb's
             // (4) put backup back

             // (1):
             0xaf, [0x7e, 0xc6, 0x48].reverse(), // LDA $7e:c648. incidentally this is the 1st e tank
             0x8d, [0x00, 0x88].reverse(),       // STA $88
             0xaf, [0x7e, 0xc6, 0x4a].reverse(), // LDA $7e:c64a
             0x8d, [0x00, 0x8a].reverse(),       // STA $8a
             0xaf, [0x7e, 0xc6, 0x4c].reverse(), // LDA $7e:c64c
             0x8d, [0x00, 0x8c].reverse(),       // STA $8c

             // (2) & (3), repeated for each ammo type:
                                                  //               ; Missiles
             0xad, [0x09, 0xc8].reverse(),        //  LDA $09C8    ;\
             'beq', 28,                           //  BEQ 0n28       ;>, If [Samus max missiles] != 0:
             0xa2, [0x00, 0x40].reverse(),        //  LDX #$0040   ; X = missile count HUD tilemap destination offset
             'jsl', [0x80, 0x9c, 0xac].reverse(), //  JSL $80:9CAC ; Draw three HUD digits

             0xaf, [0x7e, 0xc6, 0x48].reverse(), // LDA $7e:c648
             0x8d, [0x1f, 0x5c].reverse(),       // STA $1f5c
             0xaf, [0x7e, 0xc6, 0x4a].reverse(), // LDA $7e:c64a
             0x8d, [0x1f, 0x5e].reverse(),       // STA $1f5e
             0xaf, [0x7e, 0xc6, 0x4c].reverse(), // LDA $7e:c64c
             0x8d, [0x1f, 0x60].reverse(),       // STA $1f60

                                                  //               ; Supers
             0xad, [0x09, 0xcc].reverse(),        //  LDA $09CC    ;\
             'beq', 21,                           //  BEQ 0n21       ;>, If [Samus max super missiles] != 0:
             0xa2, [0x00, 0x40].reverse(),        //  LDX #$0040   ; X = super missile count HUD tilemap destination offset
             'jsl', [0x80, 0x9c, 0xb0].reverse(), //  JSL $80:9CB0 ; Draw two HUD digits

             0xaf, [0x7e, 0xc6, 0x48].reverse(), // LDA $7e:c648
             0x8d, [0x1f, 0x64].reverse(),       // STA $1f64
             0xaf, [0x7e, 0xc6, 0x4a].reverse(), // LDA $7e:c64a
             0x8d, [0x1f, 0x66].reverse(),       // STA $1f66

                                                  //               ; Power Bombs
             0xad, [0x09, 0xd0].reverse(),        //  LDA $09D0    ;\
             'beq', 21,                           //  BEQ 0n21       ;>, If [Samus max power bombs] != 0:
             0xa2, [0x00, 0x40].reverse(),        //  LDX #$0040   ; X = power bomb count HUD tilemap destination offset
             'jsl', [0x80, 0x9c, 0xb0].reverse(), //  JSL $80:9CB0 ; Draw two HUD digits

             0xaf, [0x7e, 0xc6, 0x48].reverse(), // LDA $7e:c648
             0x8d, [0x1f, 0x6a].reverse(),       // STA $1f6a
             0xaf, [0x7e, 0xc6, 0x4a].reverse(), // LDA $7e:c64a
             0x8d, [0x1f, 0x6c].reverse(),       // STA $1f6c

             // (4) put backup back
             0xad, [0x00, 0x88].reverse(),       // LDA $88
             0x8f, [0x7e, 0xc6, 0x48].reverse(), // STA $7e:c648
             0xad, [0x00, 0x8a].reverse(),       // LDA $8a
             0x8f, [0x7e, 0xc6, 0x4a].reverse(), // STA $7e:c64a
             0xad, [0x00, 0x8c].reverse(),       // LDA $8c
             0x8f, [0x7e, 0xc6, 0x4c].reverse(), // STA $7e:c64c

             // finish up by queuing the DMA!
             0x20 /* jsr */, [0xd4, 0xf8].reverse(), // call $80:d4f8
             'rts', // return
             ].flat()},
    {address: 0x054f8, type: 'freespace',
     bytes: [
             // new code at $80:d4f8:
             //     queue DMA of 9*2 bytes
             // this code was copied starting from $80:9CAA with modified values
             0xAE, [0x03, 0x30].reverse(), // LDX $0330  [$7E:0330]  ;\
             0xA9, [0x00, 0x12].reverse(), // LDA #$0012             ;| // length in source (18 bytes)
             0x95, 0xD0,                   // STA $D0,x  [$7E:00D0]  ;|
             'inx',                        // INX                    ;|
             'inx',                        // INX                    ;|
             0xA9, [0x1F, 0x5C].reverse(), // LDA #$1F5C             ;|
             0x95, 0xD0,                   // STA $D0,x  [$7E:00D2]  ;|
             'inx',                        // INX                    ;|
             'inx',                        // INX                    ;> Queue transfer of $7E:1F5C..6E to VRAM $580A..5813 (part of top row of HUD tilemap)
             0xA9, [0x00, 0x7E].reverse(), // LDA #$007E             ;|
             0x95, 0xD0,                   // STA $D0,x  [$7E:00D4]  ;|
             'inx',                        // INX                    ;|
             0xA9, [0x58, 0x0A].reverse(), // LDA #$580A             ;|
             0x95, 0xD0,                   // STA $D0,x  [$7E:00D5]  ;|
             'inx',                        // INX                    ;|
             'inx',                        // INX                    ;|
             0x8E, [0x03, 0x30].reverse(), // STX $0330  [$7E:0330]  ;/

             'rts', // return

             ].flat()},
    {address: 0x05528, type: 'freespace',
     bytes: [
             // new code at $80:d528:
             //     check for cleanup needed & perform cleanup if so (normally would call this when equipment screen has faded to black)
             0xad /* lda */, [0x1f, 0x62].reverse(), // LDA $1f62
             0xc9 /* cmp imm */, [0x2c, 0x0f].reverse(), // is our blank tile chilling here at the (misappropriated) top of the stack area?
             'beq', 1, // branch-if-equal: skip rts if blank found (equal)
             'rts', // return if blank tile's tile number wasn't what was there

             0xad /* lda */, [0x1f, 0x68].reverse(), // LDA $1f68 (lower expected blank in stack, this one is between super and pb max ammo)
             0xc9 /* cmp imm */, [0x2c, 0x0f].reverse(), // is our blank tile chilling here at the (misappropriated) top of the stack area?
             'beq', 1, // branch-if-equal: skip rts if blank found (equal)
             'rts', // return if blank tile tile number wasn't what was there

             // still, we want to bail and not repeat a DMA if this routine already ran and blanked and DMA'ed everything
             // to do this, we bail if no digits are detected in the (misappropriated) top of the stack area
             0xad /* lda */, [0x1f, 0x60].reverse(), // LDA $1f60 - lowest digit of max missile count in the (misappropriated) top of the stack area
             'sec',
             0xe9 /* sbc imm */, [0x2c, 0x00].reverse(), // SEC : SBC #$2c00 . ie, subtract 0x2c00. we wanted to find the tiles that display 0-9, of value 2c00-2c09, now we can check for <= 09 (< 0xa)
             0xc9 /* cmp imm */, [0x00, 0x0a].reverse(),
             'bmi', 25, // branch-(if)-minus ie if we found a digit. no need to check supers or pbs

             0xad /* lda */, [0x1f, 0x66].reverse(), // LDA $1f66 - lowest digit of max super count in the (misappropriated) top of the stack area
             'sec',
             0xe9 /* sbc imm */, [0x2c, 0x00].reverse(), // SEC : SBC #$2c00 . ie, subtract 0x2c00. we wanted to find the tiles that display 0-9, of value 2c00-2c09, now we can check for <= 09 (< 0xa)
             0xc9 /* cmp imm */, [0x00, 0x0a].reverse(),
             'bmi', 13, // branch-(if)-minus ie if we found a digit. no need to check pbs

             0xad /* lda */, [0x1f, 0x6c].reverse(), // LDA $1f6c - lowest digit of max pb count in the (misappropriated) top of the stack area
             'sec',
             0xe9 /* sbc imm */, [0x2c, 0x00].reverse(), // SEC : SBC #$2c00 . ie, subtract 0x2c00. we wanted to find the tiles that display 0-9, of value 2c00-2c09, now we can check for <= 09 (< 0xa)
             0xc9 /* cmp imm */, [0x00, 0x0a].reverse(),
             'bmi', 1, // branch-(if)-minus ie if we found a digit
             'rts', // return because we didn't find the remnants of an intermediate copy of an actual digit 0-9

             // put blanks over the intermediate copy of each max ammo count tile (like memset)
             'phy', // push Y register
             0xa9, [0x2c, 0x0f].reverse(),       // LDA #$2c0f (blank tile type)
             0xa2, [0x1f, 0x5c].reverse(),       // LDX #$1f5c (starting address of (misappropriated) top of stack area)
             0xa0, [0x00, 0x12].reverse(),       // LDY #$0012 (0x12=0n18=2 bytes for each of the 9 2c0f's to write at $1f5c)
             'jsl', [0x80, 0x83, 0xf6].reverse(), // JSL $80:83F6 ; Write [Y] bytes of [A] to $7E:0000 + [X] - 16-bit
             'ply', // pull to Y register

             // queue DMA to copy said blanks back onto the real HUD in VRAM
             0x20 /* jsr */, [0xd4, 0xf8].reverse(), // call $80:d4f8
             'rts', // return

             ].flat()},
    ],

// suit pickup position, a softlock prevention by strotlog
// when samus picks up gravity or varia suit, samus's X and Y position will be restored.
// some poses can be restored too.
// this is instead of being left in the center of the screen, where you could get locked if it's not connected to open air.
    suitPickupsNowPreserveSamusLocation: [
    //
    // overview of vanilla code:
    //
    // suit plm's: (varia=$84:E2A1 plm, gravity=$84:E2D6 plm, plus chozo and shot variations, 6 total plm's)
    // after the message box closes,
    // plm calls custom function (varia=$91:D4E4, gravity=$91:D5BA)
    // $91:D4E4: Varia suit pick up &
    // $91:D5BA: Gravity suit pick up:
    //     set pose <-- ** we modify the pose - same modification for each suit **
    //     set position (scroll+const = center-ish) <-- ** we modify the position slightly - same modification for each suit **
    //     set samus drawing handler function to $90:EC1D: Samus display handler - Samus recevied fatal damage
    //         (the change is accomplished via this function doing LDA #$0015 : JSL $90:F084)
    //         $90:EC1D is a jsr wrapper for 'JSL $90:8A00'. *see below for modification!
    //     call $88:8435: Spawn HDMA Object
    //         param: external function = $91:D692
    //             initializes some WRAM and various higher addresses that are documented only for other specialized purposes like x-ray and crystal flash
    //         param: pre-instruction function pointer (varia=$88:E026, gravity=$88:E05C)
    //         $88:E026: Used by varia suit pickup &
    //         $88:E05C: Used by gravity suit pickup:
    //             these must get called repeatedly during animation. each calls one function out of a sequential function pointer table of 7 animation functions:
    //             #0: $88:E092
    //             #1: $88:E0D7
    //             #2: $88:E113
    //             #3: varia=$88:E320, gravity=$88:E361
    //                 set pose again for no clear reason <-- ** we NOP the pose change out -
    //                                                           same modification for each suit **
    //             #4: $88:E1BA
    //             #5: $88:E22B
    //             #6: varia=$88:E258, gravity=$88:E25F
    //                 set music to item room music if varia <-- ** we NOP the music out **
    //                 <-- ** we insert moving samus back, and sometimes changing pose, here **
    //                 various cleanup. includes resetting samus drawing routine
    //                 (these two functions are actually a shared function with an additional instruction for varia at the top, falling through to the gravity function)
    // 
    // 
    // $90:8A00 wrapped by $90:EC1D: this is the samus display handler for elevators, door transitions, deaths, and suit pickups
    //     call              (for top of samus) $81:89AE: Add Samus spritemap to OAM
    //     sometimes call (for bottom of samus) $81:89AE: Add Samus spritemap to OAM
    //     ^ <-- ** we wrap both calls and modify any samus sprites that were just added to the OAM to be drawn,
    //              such that samus's sprites will now be drawn at highest priority (3), in front of the room tiles.
    //              this achieves samus not clipping behind anything during the suit acquisition animation.          **
    //

    // modify function "$91:D4E4: Varia suit pick up"
    // here we save off samus's position, and modify it slightly before it gets written
    {address: 0x8d57d, type: 'overwrite', description: 'animate suit acquisition',
     bytes: ['jsl', [0x92, 0xee, 0x40].reverse(), // call $92:ee40
             'bra', 7,
             'nop', 'nop', 'nop', 'nop',
             'nop', 'nop', 'nop',
             ].flat()},
    // modify function "$91:D5BA: Gravity suit pick up"
    // exact same as above (but for Gravity instead of Varia)
    {address: 0x8d655, type: 'overwrite',
     bytes: ['jsl', [0x92, 0xee, 0x40].reverse(), // call $92:ee40
             'bra', 7,
             'nop', 'nop', 'nop', 'nop',
             'nop', 'nop', 'nop',
             ].flat()},
    // define function $92:ee40: save off samus's position and modify it slightly before it gets written
    // return value: A: Y-pixel position that samus should be set to for the animation
    {address: 0x96e40, type: 'freespace',
     bytes: [
             'pha',
             // save off original position to subpixel position
             0xad /* lda */, [0x0a, 0xf6].reverse(), // LDA $0AF6: Samus X position
             0x8d /* sta */, [0x0a, 0xf8].reverse(), // $0AF8: Samus X subposition = Samus X position
             0xad /* lda */, [0x0a, 0xfa].reverse(), // LDA $0AFA: Samus Y position
             0x8d /* sta */, [0x0a, 0xfc].reverse(), // $0AFC: Samus Y subposition = Samus Y position
             'pla',
             // vanilla code we overwrote (same in both callers):
             0x8D, 0xF6, 0x0A, // STA $0AF6  [$7E:0AF6]
             0x8D, 0x10, 0x0B, // STA $0B10  [$7E:0B10]
             0xAD, 0x15, 0x09, // LDA $0915  [$7E:0915]
             0x18,             // CLC
             0x69, 0x88, 0x00, // ADC #$0088
             // register A now holds the correct return value (new samus Y = Y-scroll ($0915) + #$0088, ie the center of the screen).
             // depending on how we've posed samus for the animation, we may want to move samus upward half a tile so the animation is centered better.
             'pha',
             'clc', // clear carry status bit, as an indicator
             0xad /* lda */, [0x0a, 0x1c].reverse(), // $0A1C: Samus pose
             'beq', 6, // if pose == 0 (facing forward), goto finish
             0x49 /* eor imm */, [0x00, 0x9b].reverse(), // checking for == 0x9b - using xor avoids how cmp sets the carry flag
             'beq', 1, // if pose == 0x9b (the other facing forward), goto finish
             'sec', // set carry status bit, as an indicator and used for subtraction

             // finish:
             'pla',
             'bcs', 1, // skip return if carry set, ie if we modified samus's pose (to non-facing-forward)
             'rtl', // return if carry cleared, ie if samus is facing forward

             0xe9 /* sbc imm */, [0x00, 0x08].reverse(), // move return value visually upward (numerically less Y) by 8 pixels
             'rtl',
             ].flat()},
    // 4 functions that store hard coded face-forwards during the suit acquisition process
    // modify function $88:E320: Give Samus varia suit
    // NOP out the mid-animation pose change
    {address: 0x46335, type: 'overwrite',
     bytes: ['nop', 'nop', 'nop']},
    // modify function $88:E361: Give Samus gravity suit
    // NOP out the mid-animation pose change
    {address: 0x46376, type: 'overwrite',
     bytes: ['nop', 'nop', 'nop']},
    // modify function $91:D4E4: Varia suit pick up
    // set pose for animation and sometimes set magic number for post-animation
    {address: 0x8d551, type: 'overwrite',
     bytes: [
             'jsl', [0x92, 0xee, 0x80].reverse(), // call $92:ee80

             // did we keep facing forward and not set a special pose? then for some situations we want to set a magic number and stop facing forward when position is reset at the end of the animation.
             0xad /* lda */, [0x0a, 0x1c].reverse(), // LDA $0A1C: Samus pose
             'beq', 5, // if Samus pose == 0 (facing forward), call $92:eee0
             0xc9 /* cmp imm */, [0x00, 0x9b].reverse(),
             'bne', 4, // if Samus pose != 0x9b, skip calling

             // call $92:eee0:
             'jsl', [0x92, 0xee, 0xe0].reverse(), // if (Samus pose == 0(facing foward) || Samus pose == 0x9b(the other facing forward)), then call $92:eee0

             // postcall:
             'nop', 'nop', 'nop', 'nop',
             ].flat()},
    // modify function $91:D5BA: Gravity suit pick up
    // set pose for animation and sometimes set magic number for post-animation
    {address: 0x8d629, type: 'overwrite',
     bytes: [
             'jsl', [0x92, 0xee, 0x80].reverse(), // call $92:ee80

             // did we keep facing forward and not set a special pose? then for some situations we want to set a magic number and stop facing forward when position is reset at the end of the animation.
             0xad /* lda */, [0x0a, 0x1c].reverse(), // LDA $0A1C: Samus pose
             'beq', 5, // if Samus pose == 0 (facing forward), call $92:eee0
             0xc9 /* cmp imm */, [0x00, 0x9b].reverse(),
             'bne', 4, // if Samus pose != 0x9b, skip calling

             // call $92:eee0:
             'jsl', [0x92, 0xee, 0xe0].reverse(), // if (Samus pose == 0(facing foward) || Samus pose == 0x9b(the other facing forward)), then call $92:eee0

             // postcall:
             'nop', 'nop', 'nop', 'nop',
             ].flat()},
    // define function $92:ee80: set samus's pose for suit acquisition animation (samus will retain this pose after)
    {address: 0x96e80, type: 'freespace',
     bytes: [
             0xa2 /* ldx imm */, [0x00, 0x00].reverse(), // X=0
             0xad /* lda */, [0x09, 0xa2].reverse(), // LDA $09A2: Equipped items
             0x89 /* bit imm */, [0x00, 0x21].reverse(), // test grav and varia bits: 0x0021
             'beq', 3, // skip next instruction if no grav and no varia (power suit => X=0)
             0xa2 /* ldx imm */, [0x00, 0x9b].reverse(), // (either suit => X=9Bh)

             // if we are shinesparking (or crystal flashing?? very untested there): don't touch pose at all:
             // just pray we don't crash the game cause that seems to happen if we change to an arbitrary pose.
             // retaining the pose seems to leave samus shinesparking after the pickup, just with reset-to-0 horizontal velocity. works for me.
             // kinda sketch because it looks lke shinesparking and suit acquisition animation share some memory space (surely the velocity reset is unintentional, for example).
             // anyway, staying in shinespark pose looks cool, is very simple, and it stopped the crashes in testing.
             0xad /* lda */, [0x0a, 0x1f].reverse(), // LDA $0A1F: Samus movement type
             0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only
             0xc9 /* cmp imm */, [0x00, 0x1B].reverse(), // check for Samus movement type == 1Bh: Shinespark / crystal flash / drained by metroid / damaged by MB's attacks
             'bne', 17, // goto not_shinesparking
             // we want to return here because shinesparking will be a great pose for samus to show off while acquiring a suit, and we also want to allow shinesparking in one go, for example over the moat.
             // 1 exception: if samus is in the windup for a shinespark (also movement type == 1Bh):
             //              transitioning from windup to facing forward is required for a trick called Blue Suit via Suit Upgrade https://wiki.supermetroid.run/Blue_Suit_Glitch#Suit_Upgrade
             0xad /* lda */, [0x0a, 0x1c].reverse(), // LDA $0A1C: Samus pose
             0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only
             0xc9 /* cmp imm */, [0x00, 0xc7].reverse(), // check for Samus pose == C7h: Facing right - vertical shinespark windup
             'beq', 6, // goto not_shinesparking if in shinespark windup facing right
             0xc9 /* cmp imm */, [0x00, 0xc8].reverse(), // check for Samus pose == C8h: Facing left - vertical shinespark windup
             'beq', 1, // goto not_shinesparking if in shinespark windup facing left
             'rtl', // return without changing pose if samus is shinesparking (and not winding up)

             // not_shinesparking:
             0x8e /* stx */, [0x0a, 0x1c].reverse(), // $0A1C: Samus pose = #$009b (9Bh: Facing forward - varia/gravity suit). or in weird circumstances #$0000

             0xad /* lda */, [0x0b, 0x00].reverse(), // LDA $0B00: Samus Y radius
             // check our hitbox size vs https://wiki.supermetroid.run/File:HotaHitboxes.png .. but actually that url just has approximate numbers & is more of a visual reference. actual constant samus hitbox heights we check here come from the table at $91:B629
             0xc9 /* cmp imm */, [0x00, 0x07].reverse(), // check for morphed: height = 0n14, y-radius = 0n7
             'beq', 6, // goto morphed if morphed
             0xc9 /* cmp imm */, [0x00, 0x10].reverse(), // check for crouched: height = 0n32, y-radius = 0n16 (0x10)
             'beq', 6, // goto crouched if crouched
             'rtl', // return if neither morphed nor crouched

             // for morphing or crouched, we'll show samus in a morphed or crouched state during the animation (and stay there aferward).
             // note some surprising times samus has crouch and morph height:
             // - while unmorphing midair (has crouch height => will be crouched) and
             // - while morphing midair (has morph height => will be morphed)

             // morphed:
             0xa9 /* lda imm */, [0x00, 0x31].reverse(), // a = 31h: Facing right - morph ball - no springball - in air
             'bra', 3, // skip next instruction

             // crouched:
             // note : i wanted to use samus facing forward+crouched but it's an animation frame, not a pose. and setting a very animated pose here works very weirdly if the animation is turning. when i tried setting pose A2 here, an *animated and position-altering pose during animation*, and samus crouch-turned right-to-left into the suit, if the grab happened on the 3rd of 3 turning animation frames, samus *moved and appearance changed in the middle of* the cutscene (LN outside jail)
             0xa9 /* lda imm */, [0x00, 0x71].reverse(), // a = 71h: Facing right - crouching - aiming up-right. getting a suit is swag and samus looks cooler aiming. getting an animation frame of her facing forward while crouched would be cool but animated poses don't work (prev. comment)

             // set pose, check direction, possibly set pose again:
             0x8d /* sta */, [0x0a, 0x1c].reverse(), // $0A1C: Samus pose = a
             0xad /* lda */, [0x0a, 0x1e].reverse(), // a.lobtye = $0A1E: Samus pose X direction. 8 = right, 4 = left.
             0x89 /* bit imm */, [0x00, 0x04].reverse(), // test bit 4 (left)
             'bne', 1, // skip next instruction if samus is facing left
             'rtl', // return

             // samus is facing left:
             0xee /* inc */, [0x0a, 0x1c].reverse(), // ($0A1C: Samus pose)++. this maps either of the 2 facing right poses we have just set to the corresponding facing left pose
             'rtl', // return
             ].flat()},
    // define function $92:eee0: if samus is not on the ground, set a magic number
    {address: 0x96ee0, type: 'freespace',
     bytes: [
             0x9c /* stz */, [0x07, 0x7a].reverse(), // STZ $077A: possibly used as a magic number later
             0xad /* lda */, [0x0a, 0x1f].reverse(), // LDA $0A1F: Samus movement type
             0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only

             // on-the-ground part 1: ran into a wall
             0xc9 /* cmp imm */, [0x00, 0x15].reverse(), // check for Samus movement type == 15h: Ran into a wall
             'bne', 1,
             'rtl', // return if ran into a wall

             // on-the-ground part 2: running
             0xc9 /* cmp imm */, [0x00, 0x01].reverse(), // check for Samus movement type == 1: Running
             'bne', 1,
             'rtl', // return if running

             // on-the-ground part 3: any of:    0: Standing
             //                                0xe: Turning around - on ground
             //                                0xf: Crouching/standing/morphing/unmorphing transition
             //                               0x10: Moonwalking
             //                               0x11: Spring ball - on ground
             //                 (0x1e and 0x1f etc: beyond the end of the possible values)
             0x1a /* inc */,
             0x1a /* inc */,
             0x29 /* and imm */, [0x00, 0x0f].reverse(), // compute (Samus movement type + 2) % 16
             0xc9 /* cmp imm */, [0x00, 0x01].reverse(),
             0x3a /* dec */,
             0x3a /* dec */,
             0x3a /* dec */,
             // now the n aka negative aka minus flag is set if (Samus movement type + 2) % 16 < 3
             'bpl', 1, // branch-if-plus: skip next instruction if last dec kept us non-negative, i.e. calculation >= 3
             'rtl', // return if in any of the above movement states

             0xad /* lda */, [0x0a, 0x1f].reverse(), // LDA $0A1F: Samus movement type
             // on-the-ground part 4: morph ball - on ground (this check could be omitted based on the way this function gets used but let's do what we said we would)
             0xc9 /* cmp imm */, [0x00, 0x04].reverse(), // check for Samus movement type == 4: Morph ball - on ground
             'bne', 1,
             'rtl', // return if morphed on ground

             // on-the-ground part 5: crouching (this check could be omitted based on the way this function gets used but let's do what we said we would)
             0xc9 /* cmp imm */, [0x00, 0x05].reverse(), // check for Samus movement type == 5: Crouching
             'bne', 1,
             'rtl', // return if crouching

             // ok, we are not on the ground
             // samus will do the animation completely normally, facing forward; but afterward, enter the falling pose (left or right)
             // set this up by setting a magic word at an overloaded "$077A: Bit 1 controls flashing for Samus' helmet icon while loading"
             0xa2 /* ldx imm */, [0x1e, 0xf7].reverse(), // LDX #$1EF7 - our magic word for 'restore samus as falling - facing 'left''
             0xad /* lda */, [0x0a, 0x1e].reverse(), // a.lobtye = $0A1E: Samus pose X direction. 8 = right, 4 = left.
             0x89 /* bit imm */, [0x00, 0x04].reverse(), // test bit 4 (left)
             'bne', 3, // skip next instruction if samus is facing left

             // not on ground, and facing right:
             0xa2 /* ldx imm */, [0x1e, 0xf6].reverse(), // LDX #$1EF6 - our magic word for 'restore samus as falling - facing 'right''

             // not on ground. store magic number (right or left) in X to $077A
             0x8e /* stx */, [0x07, 0x7a].reverse(), // STX $077A
             'rtl', // return
             ].flat()},
    // modify function $88:E258 where the second instruction queues item room music track (aka elevator music aka track 3).
    // NOP this instruction out. if we start item room music, it'd be too awkward if the next room loaded will have no track change (common) and keeps playing item room music.
    //   - for some reason, gravity suit never sets music
    {address: 0x4625b, type: 'overwrite',
     bytes: ['nop', 'nop', 'nop', 'nop']},
    // 2nd modification to function $88:E258 (see above for where this function comes into play).
    //   (fyi, starting from $88:E25F, where we'll put this 2nd modification, the function applies to both gravity and varia suits)
    // this mod is super important though;
    // *actual softlock prevention*
    // we'll move samus back to where she picked up the suit
    {address: 0x4625f, type: 'overwrite',
     bytes: ['jsl', [0x92, 0xef, 0x30].reverse(), // call $92:ef30
             ].flat()},
    // define function $92:ef30: restore samus's position which was saved by $92:ee40, and possibly set pose
    {address: 0x96f30, type: 'freespace',
     bytes: [
             // restore samus's position (only to pixel-accuracy)
             0xad /* lda */, [0x0a, 0xf8].reverse(), // LDA $0AF8: Samus X subposition
             0x8d /* sta */, [0x0a, 0xf6].reverse(), // $0AF6: Samus X position = Samus X subposition
             0xad /* lda */, [0x0a, 0xfc].reverse(), // LDA $0AFC: Samus Y subposition
             0x8d /* sta */, [0x0a, 0xfa].reverse(), // $0AFA: Samus Y position = Samus Y subposition
             // for a deterministic outcome, let's zero the subpixel position, the memory for which we had commandeered/clobbered and can now release
             0x9c /* stz */, [0x0a, 0xf8].reverse(), // STZ $0AF8: Samus X subposition = 0
             0x9c /* stz */, [0x0a, 0xfc].reverse(), // STZ $0AFC: Samus Y subposition = 0

             // to prevent scrolling, copy current position to overwrite previous position
             0xad /* lda */, [0x0a, 0xf6].reverse(), // LDA $0AF6: Samus X position
             0x8d /* sta */, [0x0b, 0x10].reverse(), // $0B10: Samus previous X position = Samus X position
             0xad /* lda */, [0x0a, 0xfa].reverse(), // LDA $0AFA: Samus Y position
             0x8d /* sta */, [0x0b, 0x14].reverse(), // $0B10: Samus previous Y position = Samus Y position
             0x9c /* stz */, [0x0b, 0x12].reverse(), // STZ $0B12: Samus previous X subposition = 0
             0x9c /* stz */, [0x0b, 0x16].reverse(), // STZ $0B16: Samus previous Y subposition = 0

             // check our magic number for a pose change
             // (if it got clobbered, that's ok, samus will just hang in midair till the player presses left or right. and even if somehow the magic number was set inadvertently, normally no pose can cause a softlock.)
             0xad /* lda */, [0x07, 0x7a].reverse(), // LDA $077A: (overloaded this for storing magic number)
             0xc9 /* cmp imm */, [0x1e, 0xf6].reverse(), // CMP #$1EF6 - would indicate change pose to falling facing right
             'bne', 5, // if first magic number not found, do left check and then out
             0xa9 /* lda imm */, [0x00, 0x29].reverse(), // A = new Samus pose = #$0029: pose 29h: Facing right - falling
             'bra', 8, // goto set pose

             // do left check and then out:
             0xc9 /* cmp imm */, [0x1e, 0xf7].reverse(), // CMP #$1EF7 - would indicate change pose to falling facing left
             'bne', 14, // if neither magic number found, goto out
             0xa9 /* lda imm */, [0x00, 0x2a].reverse(), // A = new Samus pose = #$002A: pose 2Ah: Facing left  - falling

             // set pose:
             0x8d /* sta */, [0x0a, 0x1c].reverse(), // $0A1C: Samus pose = A
             // call this typical pair of function calls for completing a pose change (copied from elsewhere in vanilla)
             0x22, 0x33, 0xF4, 0x91, // JSL $91F433[$91:F433]  ; Set Samus X-direction facing and movement type from her pose, JSR $F468, and if Samus was previously screw attacking, reset palette
             0x22, 0x08, 0xFB, 0x91, // JSL $91FB08[$91:FB08]  ; Set Samus animation frame if pose changed

             // out:
             // vanilla code we overwrote:
             0xE2, 0x20,    // SEP #$20
             0xA9, 0x80,    // LDA #$80
             'rtl',
             ].flat()},
    // modify function $90:8A00: draws samus during door transitions, elevators, deaths.... and suit pickups.
    // suit pickup sets this one particular samus drawing routine, which is shared with various other states where you can't control samus.
    // 
    // the drawing routine we'll modify is not shared with any active gameplay states, so there is no gameplay performance impact to this code addition.
    // the function we're modifying has 2 calls to the same function ($81:89AE), we want to wrap both in the same way. first is for top of samus, second (sometimes not called) is for bottom part of samus.
    {address: 0x80a1d, type: 'overwrite',
     bytes: ['jsl', [0x92, 0xef, 0x80].reverse(), // call $92:ef80
             ].flat()},
    {address: 0x80a41, type: 'overwrite',
     bytes: ['jsl', [0x92, 0xef, 0x80].reverse(), // call $92:ef80
             ].flat()},
    // define function $92:ef80: wrapper for "$81:89AE Add samus spritemap [A] to OAM" which also modifies samus's sprite priority so that she is drawn in front of the room's tiles. looks pretty weird without this.
    {address: 0x96f80, type: 'freespace',
     bytes: [
             0x85 /* sta */, 0x12, // STA $12
             0xad /* lda */, [0x05, 0x90].reverse(), // LDA $0590: OAM stack pointer (more like an index. and downward growing stack i guess)
             'pha',
             0xa5 /* lda */, 0x12, // LDA $12
             // vanilla code we overwrote (just this 1 jsl instruction):
             'jsl', [0x81, 0x89, 0xae].reverse(), // JSL $8189AE[$81:89AE]  ; Add Samus spritemap [A] to OAM at position ([X], [Y])
             'plx',

             // don't modify samus drawing priority if we're riding an elevator (2 possible values of $0A44)
             0xad /* lda */, [0x0A, 0x44].reverse(), // LDA $0A44: Pointer to code to run every frame
             0xc9 /* cmp imm */, [0xe8, 0xdc].reverse(), // CMP #$E8DC
             'bne', 1,
             'rtl', // return if [$0A44] == $E8DC Samus is locked
             0xc9 /* cmp imm */, [0xe8, 0xec].reverse(), // CMP #$E8EC
             'bne', 1,
             'rtl', // return if [$0A44] == $E8EC Riding elevator

             // modify the sprites that were just drawn as part of samus to have higher priority and be drawn in front of the level
             // note: this seems to run fine for drawing samus during door transitions; the door seems to come out on top. maybe saw a slight glitch when i ran forward and got nabbed by an enemy in/near a door and kept going? but getting knocked back through the door was fine. ship is fine.
             0xec /* cpx */, [0x05, 0x90].reverse(), // CPX $0590: OAM stack pointer (post-writing samus sprites)
             'bmi', 1, // if X < [$0590], run an iteration of the loop
             'rtl',
             // OAM entry (conforms to SNES) is:
             // xxxxxxxx yyyyyyyy tttttttt vhppccct
             // ^0370,x  ^0371,x  ^0372,x  ^0373,x
             // p = priority (relative to background)
             // set pp to what we want
             0xbd /* lda rel */, [0x03, 0x72].reverse(), // LDA $0372,x
             0x09 /* or imm */,  [0x30, 0x00].reverse(), // ORA #$3000. set both pp bits (they are in the high byte of the A register due to little endian)
             0x9d /* sta rel */, [0x03, 0x72].reverse(), // STA $0372,x
             'inx',
             'inx',
             'inx',
             'inx', // X+=4. go to next OAM entry.
             'bra', (0xff+1 - 21), // branch backward 21 bytes to the cpx. loop!

             ].flat()},
    ],

}
