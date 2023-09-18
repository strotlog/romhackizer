var romhacks = {

    offsetsInRomOf100ItemPlms:  [
0x78264,
0x78404,
0x78432,
0x7852c,
0x78614,
0x786de,
0x7879e,
0x787c2,
0x787fa,
0x78824,
0x78876,
0x7896e,
0x7899c,
0x78aca,
0x78b24,
0x78ba4,
0x78bac,
0x78c36,
0x78c3e,
0x78c82,
0x78cca,
0x79108,
0x79110,
0x79184,
0x7c2e9,
0x7c337,
0x7c365,
0x7c36d,
0x7c47d,
0x7c559,
0x7c5e3,
0x7c6e5,
0x7c755,
0x7c7a7,
0x781cc,
0x781e8,
0x781ee,
0x781f4,
0x78248,
0x783ee,
0x78464,
0x7846a,
0x78478,
0x78486,
0x784ac,
0x784e4,
0x78518,
0x7851e,
0x78532,
0x78538,
0x78608,
0x7860e,
0x7865c,
0x78676,
0x7874c,
0x78798,
0x787d0,
0x78802,
0x78836,
0x7883c,
0x788ca,
0x7890e,
0x78914,
0x789ec,
0x78ae4,
0x78b46,
0x78bc0,
0x78be6,
0x78bec,
0x78c04,
0x78c14,
0x78c2a,
0x78c44,
0x78c52,
0x78c66,
0x78c74,
0x78cbc,
0x78e6e,
0x78e74,
0x78f30,
0x78fca,
0x78fd2,
0x790c0,
0x79100,
0x7c265,
0x7c2ef,
0x7c319,
0x7c357,
0x7c437,
0x7c43d,
0x7c483,
0x7c4af,
0x7c4b5,
0x7c533,
0x7c5dd,
0x7c5eb,
0x7c5f1,
0x7c603,
0x7c609,
0x7c74d
    ],

    rotation: {
        patchmain: function ({hasRoms = true, loadedroms = {}} = {}) {

            let itempatches = []

            if (hasRoms) {
                let springballcount = 0
                // this is kind of the main point of the whole patcher. take items from one rom & put into another.
                // copy all 100 item PLMs' PLM entry pointers from rando to rotation (pointer size == 2 bytes; bank $84 implied)
                // modify the in-memory copy of rotation rom in-place to save a little space
                for (address of romhacks.offsetsInRomOf100ItemPlms) { // foreach (address in list of adddresses)
                    // get the item!
                    let itemid = loadedroms['rando'].allbytes[address] + loadedroms['rando'].allbytes[address+1]*256 // convert plm from little endian
                    let newitem

                    // check for both types of 'nothing item plm' from VARIA rando - see https://github.com/theonlydude/RandomMetroidSolver/blob/master/patches/common/src/nothing_item_plm.asm
                    if (itemid === 0xbae9 || /* new 2023 */ itemid == 0xbad1) {
                        // 'nothing' chozo item, or, 'nothing' item in the open (they're one and the same,
                        //       either may use either of the above itemids in varia depending on version)
                        // because the varia 'nothing item plm' types do not exist in sm rotation, we avoid
                        // writing our own and taking up valuable bank $84 space
                        // instead we commandeer this piece of (open missile) instruction list as if it were
                        // a plm definition:
                        // $84:e0df dx $8724, $DFA9
                        // $84:8724 is a function that simply loads values into registers
                        //          (normally achieving a 'go to', but if treated as a PLM setup routine, the
                        //           caller discards Y instead of saving it. thus no-op!)
                        // what we really need is the instruction list at $84:DFA9, which first writes an empty tile
                        // (without which i found the speed booster chozo orb still appears), then deletes the PLM
                        newitem = 0xe0df
                    } else if (itemid === 0xbaed || /* new 2023 */ itemid == 0xbad5) {
                        // 'nothing' shot block item.
                        // set plm id to 0xef83 "Missile tank, shot block" but we'll have it depend on a very special parameter so that it's never there
                        newitem = 0xef83
                        // set PLM's parameter = 0x0520 (aka its unique location ID)
                        // normally this parameter is less than about 0n160 = 0xa0. it indexes the 100 item locations of the game.
                        // the key is that we use a PLM parameter such that [0xD870+(PLM parameter >> 3)] & 1 is always set to 1 in RAM.
                        // with parameter = 0x0520, the PLM ends up reading the lowest bit of byte "$7E:D914: Loading game state" as if it were an item-found bit. this byte can be various values when loading a ceres room or landing site, maybe when escaping zebes too?
                        // when loading a room that actually has an item, this byte is always set to 5: Main.
                        // the lowest bit being 1 in that byte tells the PLM "this item was already picked up. don't be an item, just be a shot block that re-forms into pretty terrain"
                        // (varia modified start locations also set the byte's value to 5 at some point when you load in, though untested whether this happens in time before a PLM in the same room might read a 0 and thus accidentally spawn.)
                        // (also, you'd think the worst that could happen if we assumed wrong that the bit will always be 1, is that someone gets some missiles they weren't supposed to, but picking them up would actually set the lowest bit of $7E:D914, which could have unpredictable results.)
                        itempatches.push({address: address+4, type: 'overwrite',
                                          bytes: [0x05, 0x20].reverse()})
                    } else {
                        newitem = itemid
                    }
                    itempatches.push({address: address, type: 'overwrite',
                                      bytes: [(newitem & 0xff), (newitem >> 8) & 0xff]})
                    // check for race mode
                    if (itemid === 0xef03 || itemid === 0xef57 || itemid === 0xefab) {
                        springballcount++
                    }
                    if (springballcount > 5) {
                        console.log('Error: Cannot read items from a Race-Mode protected rando ROM!!')
                        return []
                    }
                }
            }

            let patches = []

            if (itempatches.length != 0) {
                itempatches[0].description = 'copying items from rando rom'
                patches.push(...itempatches)
            }

            // items are done. now do a select few code patches that make things suck less!
            patches.push(...generalpatches.all()) // requires that html has loaded generalpatches.js

            patches.push(...romfeatures.maxAmmoDisplay) // requires that html has loaded romfeatures.js
            patches.push(...romfeatures.suitPickupsNowPreserveSamusLocation)

            // rotation-specific code patches
            patches.push(...romhacks.rotation.allpatches())

            return patches
        },

        zebesAwakeningPatch: [
            // part 1: when samus enters construction zone from morph ball room, call (part 2)
            // address = 0x18eb4 = ($83:8EAA + 0x10) i.e., door $83:8EAA's door asm
            {address: 0x18eb4, type: 'overwrite', description: 'rotation zebes awkening patch',
             bytes: [0xff, 0x00].reverse()},
            // part 2: ... set zebes awake event bit. (does not affect the currently loaded/loading room, but effective thereafter)
            // part 2b: ... and also set the door from construction zone (vanilla-right side of CZ; rotation-bottom side of CZ) from red to blue
            // new code at $8f:ff00:
            {address: 0x7ff00, type: 'freespace',
             bytes: [0xaf /* load  */, [0x7e, 0xd8, 0x20].reverse(),
                     0x9 /* or imm */, [0x0, 0x1].reverse(), // set zebes awake event bit
                     0x8f /* store */, [0x7e, 0xd8, 0x20].reverse(),
                     0xaf /* load  */, [0x7e, 0xd8, 0xb6].reverse(),
                     0x9, /* or imm */, [0x0, 0x4].reverse(), // set bit 4 (3rd bit) of 6th byte of the big door bitmask, ie this is the 51st (counting from 0: number 50 or 0x32) bit of doors. makes it blue
                     0x8f /* store */, [0x7e, 0xd8, 0xb6].reverse(),
                     'rts', // return
                     ].flat()},
            // part 3: when checking the state of pit room or top of morph elevator room, read the zebes awake flag directly. forget about checking morph and missiles
            //           (part 3 implementation choice: normally we'd just change the function pointer for the state-checking function, to point to the function that checks for a given event. done and done. but wait, that function requires 1 byte of space for a parameter (the "given event"), right after the function pointer, and meanwhile the vanilla morph+missile checking function requires no parameter. so inserting that 1 byte for a parameter would require repointing a ton of stuff! so we overwrite the morph+missile state-checking function's contents instead.)
            // modify "$8F:E652: Room state check: morphball and missiles" from vanilla
            {address: 0x7e652, type: 'overwrite',
             bytes: [0xaf /* load  */, [0x7e, 0xd8, 0x20].reverse(),
                     0x89 /* bit test A with constant */, [0x00, 0x01].reverse(),
                     'bne', 3, // branch-(if)-not-equal-(to-zero): branch if a matching 1 bit was found
                     // fall back to default state - room is dead
                     'inx', // X++
                     'inx', // X++ - fully passed over the pointer to 2nd (room alive) room state header, register X now pointing to next function pointer (E5E6: default state handler)
                     'rts', // return
                     // specify state header "room is alive"!
                     0xbd /* load A=*(X+0) */, 0x00, 0x00,
                     'tax', /* X=A */
                     0x4c /* jmp */, [0xe5, 0xe6].reverse(),
                     ].flat()},
            ],

        // force the BT fight as soon as samus enters the room. (sm rotation always locks you in the room; beating bt unlocks the door.)
        // modify "$84:D33B: wake PLM if Samus has bombs" from vanilla, which wakes bomb torizo (BT)
        // random note, this patch is sufficient for rotation but wouldn't be for vanilla. rotation replaced the very custom door in the room with a generic gray door, which always closes.
        bombTorizoPatch: [
            {address: 0x2533b, type: 'freespace', description: 'rotation bomb torizo patch',
             bytes: ['nop', 'nop', 'nop', // remove the "If Samus doesn't have bombs" branch
                     'nop', 'nop', 'nop', //   for the crumbling chozo,
                     'nop', 'nop',        //   using NOP x8
                     ].flat()},
            ],

        // SM rotation bug (as of latest=sm rotation beta 11): rando softlock possible because bomb wall does not auto-break in climb room (room $796BA) during escape.
        // let's modify what SM rotation didn't modify:
        //   the setup ASM for this roomstate
        //     - lives at $8f:91a9
        //     - contains tile x and y coordinates for where, upon entering room, to spawn a PLM with particular coordinates
        //       (who knows why deerforce made the PLM spawn using ASM. cause i assume it's equivalent to putting the PLM in the usual spot, the room state header's PLM set)
        //   the "pre-instruction" ASM for the code-spawned PLM
        //     - lives at $84:b927
        //     - does damage at the PLM's location only when samus is below and to the right of a pixel position that's hard-coded into the function
        //   the initialization AI ASM of the fake enemy projectile that gets spawned by the above PLM
        //     - lives in $86:b49d
        //     - hard-codes a position of a fake enemy projectile that visually pretends to cause the explosion (it's not necessary to fix this for functioning)
        fixEscapeClimb: [
            // setup ASM hard-coded values modification:
            {address: 0x791ad, type: 'overwrite', description: 'fix rotation zebes escape climb room',
             bytes: [0x07, 0x10]}, // new (x, y) tile coordinate location of PLM. keep it in the bomb wall just like vanilla sm. moved 1px to the (new left) cause the whole thing doesn't blow up anymore due to who knows what
            // pre-instruction ASM hard-coded values modification:
            {address: 0x23928, type: 'overwrite',
             bytes: [0x00, 0x00].reverse()}, // new X-pixel location of the trigger (X target=0 will always be satisfied)
            {address: 0x2392d, type: 'overwrite',
             bytes: [0x00, 0xe0].reverse()}, // new Y-pixel location of the trigger: 0x00d0. trigger on samus's center breaking a plane 2 tile heights above the top of the wall
            // projectile initialization AI ASM hard-coded values modification:
            {address: 0x3349e, type: 'overwrite',
             bytes: [0x00, 0x80].reverse()}, // new X-pixel location of the visual explosion graphic: 0x0080
            {address: 0x334a7, type: 'overwrite',
             bytes: [0x01, 0x00].reverse()}, // new Y-pixel location of the visual explosion graphic: 0x0100. pixel (0x0080, 0x0100) is tile (x=0x08, y=0x10) which puts the graphic right in the middle of the top row of the barrier in rotation, at least after screen shake
        ],

        // SM rotation bug (as of latest=sm rotation beta 11): game can crash on down-facing gadoras (top of pre-ridley and pre-draygon rooms)
        fixRidleyAndDraygonGadoras: [
            // down-facing and up-facing gadoras seem to be implemented somewhat differently, with a bigger change for down-facing gadoras vs. vanilla
            // the down-facing ones don't correctly modify BTS and PLM, resulting in spawning a random plm if samus shoots anything but the leftmost block while the gadora is in a dying state.
            // pre-ridley dying gadora will spawn a plm that immediately jsr's to $84:ffff (last byte of bank $84 empty space) which crashes the game
            // (pre-draygon seems to spawn part of a varia suit plm O_o the difference is just what happens to be in $(12),y. and then doesn't crash. grapple block BTS code for BTS >= 0x80 interprets BTS 0xff as needing its own instructions when it's not set up to correctly point to an adjacent block/tile)
            // rotation's down-facing eye plm introduces a new function (which its up-facing eye plm doesn't do). namely, $84:f160. this new function seems to sort of substitute, incompletely, for $84:D7C3: Instruction - move PLM up one row and make a blue door facing right
            // so, we'll complete its job
            //
            // forwards compatibility:
            // beta 11's $84:f160 ends with 'rts' + 3x 0xff (free space)
            // - if a future version of sm: rotation enlarges this function,
            //   then the patcher *will give a free space error and not patch the rom* because the freespace is no longer there. then this patch should be deleted.
            // - if a future version of sm: rotation fixes the bug without enlarging the function,
            //   then this patch will run on top of it if it still actually calls $84:f160. but it only acts if it finds an invalid (odd-numbered) value so likely still OK.
            {address: 0x2716c, type: 'overwrite', description: 'fix rotation-specific gadora crash',
             bytes: [0x20 /* jsr */]}, // incomplete instruction, see next patch
            {address: 0x2716d, type: 'freespace', // note comment above about intentionally triggering freespace errors in future
             bytes: [
                     [0xf2, 0x40].reverse(), // complete the instruction as "JSR $f240": call new function $84:f240
                     'rts', // overwritten instruction
                     ].flat()},
            // new function at $84:f240: correct the plm block index, to point to the left block of the down-facing door;
            //                                   the BTS bytes for the 4 blocks of the down-facing door; and
            //                                   the level data's corresponding block types for the 4 blocks
            {address: 0x27240, type: 'freespace', // note comment above about intentionally triggering freespace errors in future
             bytes: [
                     0xbd /* lda x-indexed */, [0x1c, 0x87].reverse(), // LDA $1c87,X  // $1C87..D6: PLM block indices (into $7F:0002)
                     0x89 /* bit imm */, [0x00, 0x01].reverse(), // test for odd value
                     'bne', 1, // skip next instruction if odd
                     'rts', // return if [0x1c87+x] is even

                     // ok, the block index is odd, but it should always be even. this requirement exists because the entries in table $7F:0002 are 1 word in width, whereas the offset pointing into the table is in byte terms
                     // since it's odd, we know $84:f160 has a bug
                     0x1a /* inc a */, // undo $84:f160's single decrement - go back to pointing to a full block
                     0x9d, /* sta x-indexed */, [0x1c, 0x87].reverse(), // STA $1c87,X (... and store the result.)

                     //
                     // now that we fixed that part...
                     // the buggy function we modified runs multiple times:
                     // - 1st time this is called: is the moment the gadora's health reaches 0
                     // - 2nd time this is called: is around when the gadora death animation ends
                     // we are going to move the PLM in a moment, except, we when we get called the 2nd time, we don't want to move the PLM again, so it'll be conditional
                     // - a very separate time this is called: when loading the room with the gadora dead
                     // so correspondingly,
                     //   if our fix hasn't been applied, => apply it.
                     //   if it has, => correct the odd-numbered value at [0x1c87+x] and leave
                     //   if we're loading the room with the gadora dead, => point the PLM correctly and leave
                     // we can distinguish these situations because the 4 blocks for the door will have the following BTS values at this point:
                     // (the below are shown as post-increment, because we've already undone the weird, buggy single decrement that $84:f160 performs every time, and you can't really show the meaning of an invalid in-between pointer anyway)
                     // if full fix hasn't been applied (hex) -> 00 44 ff 00
                     //                                             ^ PLM location in the room points to this block
                     //                                               therefore now we should apply the full fix to all 4 BTS values *and* all 4 block types as well
                     // if full fix has been applied    (hex) -> 43 ff fe fd
                     //                                          ^ PLM location in the room points to this leftmost block now
                     //                                            therefore all we needed was the re-incrementing that we just did, so return
                     // if loading room w/ dead gadora  (hex) -> 43 ff fe fd
                     //                                             ^ PLM location in the room points to this incorrect block (mainly seems to cause a graphical glitch if left alone)
                     //                                               therefore let's point the PLM to 0x43 where it belongs
                     //
                     'phx', // push X
                     0x4a /* lsr a */, // A=PLM's block-location's byte index in BTS table
                                       //  =PLM's block-location's byte index in level data table / 2
                                       //  =[0x1c87+x]/2
                     'tax', // X now indexes into $7f:6402: BTS table, pointing at the BTS of the block that is this PLM's location
                     'sep', 0x20,
                     0xbf /* lda x-indexed long */, [0x7f, 0x64, 0x02].reverse(), // LDA $7f6402,X  // $7F:6402..9601: Active BTS table
                     0xc9 /* cmp imm */, [0x44], // BTS at this PLM's location == 0x44? (Generic shot trigger: 0x44 is used for eye doors. at this point the eye door has been shot to 0 health and is supposed to have been deleted from existing as a BTS, but isn't deleted under the beta 11 bug we're fixing.)
                     'beq', 8, // goto BTS_0x44_or_BTS_0xff if [$7f6402+(PLM block index/2)] == 0x44
                     0xc9 /* cmp imm */, [0xff], // BTS at this PLM's location == 0xff? (seems to point to the BTS 1 block to the left?)
                     'beq', 4, // goto BTS_0x44_or_BTS_0xff if [$7f6402+(PLM block index/2)] == 0xff

                     // nothing to fix, we were just called an extra time, so return.
                     'rep', 0x20,
                     'plx', // pull X: X is back to being our PLM index
                     'rts',

                     // BTS_0x44_or_BTS_0xff:
                     'rep', 0x20,
                     'plx', // pull X: X is back to being our PLM index
                     // move the plm one tile left: [0x1c87+X]-=2
                     // thus changing the value in this table: $1C87..D6: PLM block indices (into $7F:0002)
                     0xde, /* dec x-indexed */, [0x1c, 0x87].reverse(), // in-memory decrement of $1c87,X
                     0xde, /* dec x-indexed */, [0x1c, 0x87].reverse(), // in-memory decrement of $1c87,X
                     'sep', 0x20,
                     0xc9 /* cmp imm */, [0xff], // BTS at the PLM's old location == 0xff? (seems to point to the BTS 1 block to the left?)
                     'rep', 0x20,
                     'bne', 1, // skip next instruction if the BTS we originally checked was not 0xff (ie, it was 0x44)
                     'rts', // return if BTS we originally checked was 0xff

                     // BTS we originally checked was 0x44:
                     // part (2) of full fix: correct the BTS bytes and block types for the 4 door blocks
                     //   values of A for calls to $84:82B4: Write level data block type and BTS:
                     //  |vanilla|  |rotation|
                     //        BTS        BTS
                     //   #$C0 40 -> #$C0 42
                     //   #$D0 FF -> #$50 FF
                     //   #$D0 FE -> #$50 FE
                     //   #$D0 FD -> #$50 FD
                     // we perform only the first one here and hand off the rest to $84:D7EF, which sm rotation repurposed for the above latter 3 calls to $84:82B4
                     //   vanilla  $84:D7EF: Create 3 block vertical extension   (JMP to this and it will PLX:RTS for you)
                     //   rotation $84:D7EF: Create 3 block horizontal extension (JMP to this and it will PLX:RTS for you)
                     'phx', // push the PLM index; the target of our upcoming JMP will pull it and return control to the PLM processing routine, where X is expected to be the PLM index
                     0xbd /* lda x-indexed */, [0x1c, 0x87].reverse(), // LDA $1c87,X  // $1C87..D6: PLM block indices (into $7F:0002)
                     'tax', // X now indexes into $7f:0002: Level data block table, (with some bits of each word used for indicating block type). it points to the block corresponding to this PLM
                     0xa9 /* lda imm */, [0xc0, 0x43].reverse(), // set BTS 0x43: Blue door facing down
                     // set the leftmost BTS
                     0x20 /* jsr */, [0x82, 0xb4].reverse(), // JSR $82B4: Write level data block type and BTS
                     // set the other 3 BTSes, then PLX:RTS
                     0x4c /* jmp 16-bit */, [0xd7, 0xef].reverse(), // JSR $D7EF: Create 3 block horizontal extension
                     ].flat()},
        ],

        fasterIntro: [
            //
            // change the intro sequence, preserving the credits that were inserted by the author of sm rotation.
            // (comment block is mostly background info; skip to the bit about $CADF toward the end of it for implementation)
            //
            // bank $8B contains a series of functions with relatively little documentation:
            // game state $1E: Intro handler at $8B:A35B (shared with other game states), calls the function pointer at
            // $7E:1F51 "Current cinematic function" every frame, plus separately calls function pointers within each cinematic object.
            // this sole current cinematic function typically checks a condition; once met, it changes $7E:1F51 to point to the next function.
            // here is part of the pre-ceres chain of such functions - all must be in bank $8B:
            //   [last object of last text scene sets $7E:1F51 to point to $B72F]
            //   $B72F -> $BCA0
            //   ^ie, some iteration of cinematic function $8B:B72F sets $7E:1F51 to point to $(8B:)BCA0 instead of to itself
            //   $BCA0: does ceres prep, then...
            //   vanilla $BCA0:
            //     ceres prep
            //     loads ceres audio data & plays it now
            //     $BCA0 -> $BDE4
            //   rotation $BCA0 (rotation removes ceres here):
            //     ceres prep
            //     loads ceres audio data & queues playing it, but "later" = hopefully never
            //     sets ceres-ridley = dead
            //     sets $D914 Loading game state = 0x22: Escaping Ceres / landing on Zebes
            //     $BCA0 -> $C5CA
            //     ^ie, sets a different next cinematic function vs. the one set by vanilla $BCA0
            // vanilla post-ceres chain of cinematic functions:
            //   [ceres exploding goes down a chain of cinematic functions, eventually $C345]
            //   ... -> $C345 -> $C5CA -> $C610 -> $C627 -> $C699 -> $C79C -> $C7CA -> $A38F (no-op. rts.)
            //                         \
            //                    ^^^   -> (see our modification below)
            //                    |||
            //                   sm rotation sets $7E:1F51 "Current cinematic function" to $C5CA early, in $BCA0,
            //                   skipping some cinematic functions (skips $BDE4, $C345, and several functions in between).
            //                   thus, ceres never starts or happens.
            // most cinematic functions from $C5CA onward are the 'flying to zebes' scene, which sm rotation preserves, but we want to remove.
            // also, the chain goes further than the above, all cinematics:
            //   [the 'planet zebes' text object, as its own last instruction, sets $7E:1F51 to point to $C9F9]
            //   $C9F9 -> $CA36 -> $CA85 -> $CAD0 -> $CADE (no-op. rts.)
            //   [the Zebes Stars 5 object changes its own function pointer from $82:C8AA to $82:C8B9]
            //   [the Zebes Stars 5 object, in its new function, checks if -128 < (stars' y-position) < 0;
            //                              if yes, sets $7E:1F51 to point to $CADF]
            //   $CADF -> (no next cinematic function whatsoever; $CADF transitions game state to 6 (Loading) instead, and the game state 6 handler takes over)
            //    ^^^
            //    |||
            //   our modification will set $7E:1F51 "Current cinematic function" to $CADF early, in $C5CA,
            //   skipping some cinematic functions (skips $C610, $CAFE, and several functions in between).
            //   thus, flying-to-zebes never happens.
            //
            {address: 0x5c604, type: 'overwrite', description: 'speedup rotation intro',
             bytes: [0xca, 0xdf].reverse()},
            // sm rotation does some weird modification of the loading of ceres audio data that's done in $8B:BCA0 (presumably the audio data needs to be loaded in in order to be used in flying-to-zebes, which sm rotation preserves, but we want to remove).
            // when we land on zebes extra early like with the above change, there's some artifact still left in the audio queue that was put there by $8B:BCA0.
            // the artifact in the queue leads to no music when the landing site is initially displayed, and to a small glitch and delay when samus disembarks.
            // luckily, by this point (around the end of intro text), no audio is needed in any further cinematics, because we've decided there will be no further cinematics!
            // so just NOP out the loading of audio data at the end of the intro text:
            {address: 0x5bdd5, type: 'overwrite',
             bytes: [0xea, 0xea, 0xea, 0xea]}, // NOP out the JSL instruction at $8B:BDD5
            {address: 0x5bddf, type: 'overwrite',
             bytes: [0xea, 0xea, 0xea, 0xea]}, // NOP out the JSL instruction at $8B:BDDF
            //
            // faster text scene (the other part of the speedup):
            //
            // cinematic intro text page 1 (of 1 in sm rotation): end early, skipping hundreds of 1-frame 'nothing' objects.
            // insert a 'go to'
            // NOTE: this modifies an entry in list of *variable-length* cinematic instructions.
            //       therefore, if in future versions of sm rotation, something changes in this scene other than the text/duration/positioning,
            //       this patch could crash because it might have overwritten the middle of some other instruction instead of the beginning of a new one.
            //
            {address: 0x64739, type: 'overwrite',
             bytes: [
                     [0x97, 0x1e].reverse(), // 'go to/goto'. instructs to call $8B:971E. $8B:971E: Instruction - go to [[Y]]
                     [0xd5, 0xd3].reverse(), // parameter for $8B:971E. param=$8C:D5D3. target address of 'go to/goto' in bank $8C
                     ].flat()},
            // modify the duration of final wait at the end of the text scene @ $8C:D5D3
            // the value below can be modified again if a more ideal delay is found.
            // (quirk: the sm rotation text page 1 ending, uses vanilla's text page 6 ending without modifying page 6 ending address)
            {address: 0x655D5, type: 'overwrite',
             bytes: [0x00, 0x1e].reverse()}, // change delay from 0x0080 to 0x001e frames
            // the rest: make the text print faster @ $8c:c383 data
            //           - the object data is already modified by sm rotation, we modify it further
            //           - implemented as many single-byte modifications:
            //             - this avoids overwriting the letters & their positions in future sm rotation updates
            //           - this could be generated here in a loop in our code, but that would be less portable if patches change language in future
            // every 6 bytes from 0x6438B (an object for the letter 'S') through 0x6454D (a 'C') (inclusive): set to 2 frames instead of 5 frames
            {address: 0x6438b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64391, type: 'overwrite', bytes: [0x02]},
            {address: 0x64397, type: 'overwrite', bytes: [0x02]},
            {address: 0x6439d, type: 'overwrite', bytes: [0x02]},
            {address: 0x643a3, type: 'overwrite', bytes: [0x02]},
            {address: 0x643a9, type: 'overwrite', bytes: [0x02]},
            {address: 0x643af, type: 'overwrite', bytes: [0x02]},
            {address: 0x643b5, type: 'overwrite', bytes: [0x02]},
            {address: 0x643bb, type: 'overwrite', bytes: [0x02]},
            {address: 0x643c1, type: 'overwrite', bytes: [0x02]},
            {address: 0x643c7, type: 'overwrite', bytes: [0x02]},
            {address: 0x643cd, type: 'overwrite', bytes: [0x02]},
            {address: 0x643d3, type: 'overwrite', bytes: [0x02]},
            {address: 0x643d9, type: 'overwrite', bytes: [0x02]},
            {address: 0x643df, type: 'overwrite', bytes: [0x02]},
            {address: 0x643e5, type: 'overwrite', bytes: [0x02]},
            {address: 0x643eb, type: 'overwrite', bytes: [0x02]},
            {address: 0x643f1, type: 'overwrite', bytes: [0x02]},
            {address: 0x643f7, type: 'overwrite', bytes: [0x02]},
            {address: 0x643fd, type: 'overwrite', bytes: [0x02]},
            {address: 0x64403, type: 'overwrite', bytes: [0x02]},
            {address: 0x64409, type: 'overwrite', bytes: [0x02]},
            {address: 0x6440f, type: 'overwrite', bytes: [0x02]},
            {address: 0x64415, type: 'overwrite', bytes: [0x02]},
            {address: 0x6441b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64421, type: 'overwrite', bytes: [0x02]},
            {address: 0x64427, type: 'overwrite', bytes: [0x02]},
            {address: 0x6442d, type: 'overwrite', bytes: [0x02]},
            {address: 0x64433, type: 'overwrite', bytes: [0x02]},
            {address: 0x64439, type: 'overwrite', bytes: [0x02]},
            {address: 0x6443f, type: 'overwrite', bytes: [0x02]},
            {address: 0x64445, type: 'overwrite', bytes: [0x02]},
            {address: 0x6444b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64451, type: 'overwrite', bytes: [0x02]},
            {address: 0x64457, type: 'overwrite', bytes: [0x02]},
            {address: 0x6445d, type: 'overwrite', bytes: [0x02]},
            {address: 0x64463, type: 'overwrite', bytes: [0x02]},
            {address: 0x64469, type: 'overwrite', bytes: [0x02]},
            {address: 0x6446f, type: 'overwrite', bytes: [0x02]},
            {address: 0x64475, type: 'overwrite', bytes: [0x02]},
            {address: 0x6447b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64481, type: 'overwrite', bytes: [0x02]},
            {address: 0x64487, type: 'overwrite', bytes: [0x02]},
            {address: 0x6448d, type: 'overwrite', bytes: [0x02]},
            {address: 0x64493, type: 'overwrite', bytes: [0x02]},
            {address: 0x64499, type: 'overwrite', bytes: [0x02]},
            {address: 0x6449f, type: 'overwrite', bytes: [0x02]},
            {address: 0x644a5, type: 'overwrite', bytes: [0x02]},
            {address: 0x644ab, type: 'overwrite', bytes: [0x02]},
            {address: 0x644b1, type: 'overwrite', bytes: [0x02]},
            {address: 0x644b7, type: 'overwrite', bytes: [0x02]},
            {address: 0x644bd, type: 'overwrite', bytes: [0x02]},
            {address: 0x644c3, type: 'overwrite', bytes: [0x02]},
            {address: 0x644c9, type: 'overwrite', bytes: [0x02]},
            {address: 0x644cf, type: 'overwrite', bytes: [0x02]},
            {address: 0x644d5, type: 'overwrite', bytes: [0x02]},
            {address: 0x644db, type: 'overwrite', bytes: [0x02]},
            {address: 0x644e1, type: 'overwrite', bytes: [0x02]},
            {address: 0x644e7, type: 'overwrite', bytes: [0x02]},
            {address: 0x644ed, type: 'overwrite', bytes: [0x02]},
            {address: 0x644f3, type: 'overwrite', bytes: [0x02]},
            {address: 0x644f9, type: 'overwrite', bytes: [0x02]},
            {address: 0x644ff, type: 'overwrite', bytes: [0x02]},
            {address: 0x64505, type: 'overwrite', bytes: [0x02]},
            {address: 0x6450b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64511, type: 'overwrite', bytes: [0x02]},
            {address: 0x64517, type: 'overwrite', bytes: [0x02]},
            {address: 0x6451d, type: 'overwrite', bytes: [0x02]},
            {address: 0x64523, type: 'overwrite', bytes: [0x02]},
            {address: 0x64529, type: 'overwrite', bytes: [0x02]},
            {address: 0x6452f, type: 'overwrite', bytes: [0x02]},
            {address: 0x64535, type: 'overwrite', bytes: [0x02]},
            {address: 0x6453b, type: 'overwrite', bytes: [0x02]},
            {address: 0x64541, type: 'overwrite', bytes: [0x02]},
            {address: 0x64547, type: 'overwrite', bytes: [0x02]},
            {address: 0x6454d, type: 'overwrite', bytes: [0x02]},
            // every 6 bytes from 0x64553 (an object for the letter 'T') through 0x64589 (a 'O') (inclusive): set to 3 frames instead of 5 frames
            {address: 0x64553, type: 'overwrite', bytes: [0x03]},
            {address: 0x64559, type: 'overwrite', bytes: [0x03]},
            {address: 0x6455f, type: 'overwrite', bytes: [0x03]},
            {address: 0x64565, type: 'overwrite', bytes: [0x03]},
            {address: 0x6456b, type: 'overwrite', bytes: [0x03]},
            {address: 0x64571, type: 'overwrite', bytes: [0x03]},
            {address: 0x64577, type: 'overwrite', bytes: [0x03]},
            {address: 0x6457d, type: 'overwrite', bytes: [0x03]},
            {address: 0x64583, type: 'overwrite', bytes: [0x03]},
            {address: 0x64589, type: 'overwrite', bytes: [0x03]},
            // every 6 bytes from 0x6458F (an object for the letter 'R') through 0x6459B (a 'U') (inclusive): set to 3 frames instead of 5 frames
            {address: 0x6458f, type: 'overwrite', bytes: [0x03]},
            {address: 0x64595, type: 'overwrite', bytes: [0x03]},
            {address: 0x6459b, type: 'overwrite', bytes: [0x03]}
            // (last 7 characters are left as 5 frames so that the typing sound doesn't last for a long time after all the letters have appeared)
        ],

        // SM rotation bug (as of latest=sm rotation beta 11): game can crash (technically infinite loop) if you drop a pb at the top (new) of croc escape room
        fixCrocEscapeCrash: [
            // point croc escape room setup asm (in its 1 state) to a new function. was: simply pointing to a RTS function
            {address: 0x7aa33, type: 'overwrite', description: 'fix croc escape pb\'ing bad block crash',
             bytes: [0xea, 0x90].reverse()}, // -> new setup asm function at $8f:ea90
            {address: 0x7ea90, type: 'freespace', // new setup asm function at $8f:ea90:
             bytes: [0xaf /* lda.l absolute */, [0x7f, 0x00, 0x56].reverse(), // check block 2A tile data
                     0x29 /* and imm */, [0xf0, 0x00].reverse(), // high nibble only (= tile type)
                     0xc9 /* cmp imm */, [0x50, 0x00].reverse(),
                     'beq', 1, // return unless tile type == 5 (horizontal extension block)
                     'rts',
                     // repeat for block 0x2B:
                     0xaf /* lda.l absolute */, [0x7f, 0x00, 0x58].reverse(), // check block 2B tile data
                     0x29 /* and imm */, [0xf0, 0x00].reverse(),
                     0xc9 /* cmp imm */, [0x50, 0x00].reverse(),
                     'beq', 1,
                     'rts',
                     0xaf /* lda.l absolute */, [0x7f, 0x64, 0x2c].reverse(), // check block 2A+2B BTS data
                     0xc9 /* cmp imm */, [0xff, 0x01].reverse(), // high byte (2B's BTS) == FF (== -1 meaning point to 2A) && low byte (2A's BTS) == 01 (meaning point to 2B)
                     'bne', 1, // return unless infinite loop detected
                     'rts',
                     // infinite loop bug detected, if samus were to pb and the explosion hits tile 2A or 2B, the game's dead
                     // simply make the left one point left and the right one point right, instead of to each other:
                     'xba', // swap the BTS bytes of the two blocks within the accumulator
                     0x8f /* sta.l absolute */, [0x7f, 0x64, 0x2c].reverse(), // ovewrite block 2A+2B BTS data
                     'rts' // return
                     ].flat()},
        ],

        plmLocationPatchGenerator: function() {
            let patches = []
            // 96 out of 100 items work great in rotation with just copying their plm id.
            // only quirk is, sm rotation beta 11 has swapped the positions of the other 4 items, which are all missile packs in a non-rando.
            // let's swap them back to their traditional positions by creating a patch for the x & y positions of these 4 PLMs.
            plms = [
             {// correct location of ocean missiles (in rotation, was @ maze missiles @ (0x30, 0x02))
              plmOffsetInRom: 0x781e8, newX: 0x04, newY: 0x02},
             {// correct location of maze missiles (in rotation, was @ ocean missiles @ (0x04, 0x02))
              plmOffsetInRom: 0x781f4, newX: 0x30, newY: 0x02},
             {// correct location of big pink missiles outside charge (in rotation, was @ middle of big pink missiles near grapple blocks @ (0x6d, 0x24))
              plmOffsetInRom: 0x7860e, newX: 0x38, newY: 0x22},
             {// correct location of middle of big pink missiles near grapple blocks (in rotation, was @ big pink missiles outside charge @ (0x38, 0x22))
              plmOffsetInRom: 0x78608, newX: 0x6d, newY: 0x24}
            ]
            plms.forEach(function (plm) {

                // edit PLM:
                //  ____________ PLM ID - or more accurately, PLM entry (definition) address in bank $84
                // |     _______ X position
                // |    |   ____ Y position
                // |    |  |   _ Parameter - not important here but FYI, for item PLMs, Parameter is the unique item location ID indexing into the $7E:D870..AF array
                // |    |  |  |
                // iiii xx yy pppp
                patches.push({address: plm['plmOffsetInRom'] + 2, type: 'overwrite',
                              bytes: [plm['newX'], plm['newY']]})
             })
            return patches
        },

        allpatches: function() {
            let patches = []
            patches.push(...romhacks.rotation.zebesAwakeningPatch)
            patches.push(...romhacks.rotation.bombTorizoPatch)
            patches.push(...romhacks.rotation.fixEscapeClimb)
            patches.push(...romhacks.rotation.fixRidleyAndDraygonGadoras)
            patches.push(...romhacks.rotation.fasterIntro)
            patches.push(...romhacks.rotation.fixCrocEscapeCrash)
            patches.push(...romhacks.rotation.plmLocationPatchGenerator())
            return patches
        },
    },
    // end rotation

    otherRotation: {

        sm_to_otherRotation_remapping: {
            // otherRotation moves the ROM location of 5 plm populations/instance definitions, vs those listed in offsetsInRomOf100ItemPlms:
            // case sensitive--must use lowercase so that lookups work!
            '0x78404' : '0x7eb56', // bombs plm vanilla : otherRotation
            '0x7c2e9' : '0x7ecd8', // ws reserve
            '0x7c2ef' : '0x7ecde', // ws reserve missile
            '0x7c603' : '0x7ee16', // aqueduct missile
            '0x7c609' : '0x7ee1c', // aqueduct super
        },

        patchmain: function ({hasRoms = true, loadedroms = {}} = {}) {

            let itempatches = []

            if (hasRoms) {
                let springballcount = 0

                for (address of romhacks.offsetsInRomOf100ItemPlms) {
                    let fromAddress = address
                    let toAddress
                    if (('0x' + fromAddress.toString(16)) in romhacks.otherRotation.sm_to_otherRotation_remapping) {
                        toAddress = parseInt(romhacks.otherRotation.sm_to_otherRotation_remapping['0x' + fromAddress.toString(16)])
                    } else {
                        toAddress = fromAddress
                    }
                    // get the item!
                    let itemid = loadedroms['rando'].allbytes[fromAddress] + loadedroms['rando'].allbytes[fromAddress+1]*256 // convert plm from little endian
                    let newitem

                    // check for both types of 'nothing item plm' from VARIA rando - see https://github.com/theonlydude/RandomMetroidSolver/blob/master/patches/common/src/nothing_item_plm.asm
                    if (itemid === 0xbae9 || /* new 2023 */ itemid == 0xbad1) {
                        // 'nothing' chozo item, or, 'nothing' item in the open (they're one and the same,
                        // either may use either of the above itemids in varia depending on version)
                        // draw empty and delete, see comments on 0xbae9 from rotation, this is a bit hacky
                        newitem = 0xe0df
                    } else if (itemid === 0xbaed || /* new 2023 */ itemid == 0xbad5) {
                        // hidden 'nothing', see comments on 0xbaed from rotation, this is also a bit hacky
                        newitem = 0xef83
                        itempatches.push({address: toAddress+4, type: 'overwrite',
                                          bytes: [0x05, 0x20].reverse()})
                    } else {
                        newitem = itemid
                    }
                    itempatches.push({address: toAddress, type: 'overwrite',
                                      bytes: [(newitem & 0xff), (newitem >> 8) & 0xff]})
                    // check for race mode
                    if (itemid === 0xef03 || itemid === 0xef57 || itemid === 0xefab) {
                        springballcount++
                    }
                    if (springballcount > 5) {
                        console.log('Error: Cannot read items from a Race-Mode protected rando ROM!!')
                        return []
                    }
                }
            }

            let patches = []

            if (itempatches.length != 0) {
                itempatches[0].description = 'copying items from rando rom'
                patches.push(...itempatches)
            }

            // items are done. now do a select few code patches that make things suck less!
            patches.push(...generalpatches.all()) // requires that html has loaded generalpatches.js

            patches.push(...romfeatures.maxAmmoDisplay) // requires that html has loaded romfeatures.js
            patches.push(...romfeatures.suitPickupsNowPreserveSamusLocation)

            // otherRotation-specific code patches
            patches.push(...romhacks.otherRotation.allpatches())

            return patches
        },

        startOnZebesAndOpenSoftlockDoors: [ // start on zebes is aka skip ceres (incl. skip intro. no credits in intro)
            {address: 0x16eda, type: 'overwrite', description: 'otherRotation start on zebes and open softlock doors',
             bytes: [0x1f]},
            // above is not sufficient for otherRotation, as that hack overwrites the corrupt-save detection in vanilla $81:8085 Load from SRAM
            // main menu loads existing slot 1 such that when you start a blank slot 2 with the skipped corruption detection, it inherits slot 1's load station
            // so, we intervene here in the same place, where we're already diverting away from the intro
            {address: 0x16edf, type: 'overwrite',
             bytes: ['jsl', [0x82, 0xfa, 0x10].reverse(), // jsl $82:fa10
                     'nop', 'nop'].flat()},
            // new code at $82:fa10:
            {address: 0x17a10, type: 'freespace',
             bytes: [0xa9 /* lda imm */, [0x00, 0x00].reverse(), // LDA #$0000
                     0x8f /* sta.l */, [0x7e, 0x07, 0x9f].reverse(), // [$079F] Area index = 0 (Crateria)
                     0x8f /* sta.l */, [0x7e, 0x07, 0x8b].reverse(), // [$078B] Load station index = 0 (means Samus's ship aka landing site, when area=Crateria. list @ $80:C4C5)
                     0xa9 /* lda imm */, [0x00, 0x05].reverse(), // LDA #$0005
                     0x8f /* sta.l */, [0x7e, 0xd9, 0x14].reverse(), // [$D914] Loading game state = 5 (main). prevents us thinking this should be intro on next game load. normally set by landing sequence which we skip.

                     // open softlock doors: (including this here since we have a good hook already, namely new game; otherwise unrelated):
                     // top of red tower softlock prevention
                     0xaf /* lda.l */, [0x7e, 0xd8, 0xb2].reverse(),
                     0x09 /* ora imm */, [0x00, 0x01].reverse(), // open (turn blue) the 0x10th (0n16th) door bit by setting to 1 (red brin ele -> crat door)
                     0x8f /* sta.l */, [0x7e, 0xd8, 0xb2].reverse(),

                     // save game
                     0xaf /* lda.l */, [0x7e, 0x09, 0x52].reverse(), // must load [$0952] Save slot selected to A for call
                     'jsl', [0x81, 0x80, 0x00].reverse(), // call $81:8000 Save to SRAM

                     // restore overwritten instructions
                     0xa9 /* lda imm */, [0xa3, 0x95].reverse(), // LDA #$A395
                     0x8f /* sta.l */, [0x7e, 0x1f, 0x51].reverse(), // STA $7e1f51
                     'rtl'
                     ].flat()},
        ],

        shipLoadCameraPosition: [
            // edit 'samus's ship' save station position info (first entry in $80:c4c5)
            {address: 0x44cb, type: 'overwrite', description: 'otherRotation adjust camera for landing site load',
             bytes: [[0x03, 0xe0].reverse(), // camera X = 3 7/8 screens
                     [0x03, 0xe0].reverse(), // camera Y = 3 7/8 screens
                     [0x00, 0x51].reverse(), // samus on-screen Y = 0x51 (fits camera adjustment)
                     [0xff, 0xf0].reverse(), // samus on-screen X = -0x10 to center (fits camera adjustment)
                     ].flat()},
            // $80:C437 Load from load station, in vanilla is willing to write non-multiples of 256 to
            // $091d BG1 X offset and $091f BG1 Y offset. such non-multiples completely screw up door animations,
            // shot block animations, and item PLM animations. turns out 0 seems perfectly safe rather than
            // calculating a nearby multiple of 256!
            {address: 0x4473, type: 'overwrite',
             bytes: [0x9c /* stz */, [0x09, 0x1d].reverse()
                     ].flat()},
            {address: 0x447c, type: 'overwrite',
             bytes: [0x9c /* stz */, [0x09, 0x1f].reverse()
                     ].flat()},
        ],

        allpatches: function() {
            let patches = []
            // copy some of our work from sm rotation
            patches.push(...romhacks.rotation.zebesAwakeningPatch)
            patches.push(...romhacks.rotation.bombTorizoPatch)
            // the otherRotation-specific patches:
            patches.push(...romhacks.otherRotation.startOnZebesAndOpenSoftlockDoors)
            patches.push(...romhacks.otherRotation.shipLoadCameraPosition)
            return patches
        },
    },
    // end otherRotation

    unhundo: {

        sm_to_unhundo_remapping: {
            // unhundo moves the ROM location of 1 plm population/instance definition, vs those listed in offsetsInRomOf100ItemPlms:
            // case sensitive--must use lowercase so that lookups work!
            '0x7874c' : '0x7eae6', // blue brin PBs plm vanilla : unhundo
            // plus *we* move the ROM location of morph ball in the same room. part 1 of 2 of moving it:
            '0x786de' : '0x7eae0', // morph ball plm vanilla : unhundo-as-customized-by-this-code
        },

        patchmain: function ({hasRoms = true, loadedroms = {}} = {}) {

            let itempatches = []

            if (hasRoms) {
                let springballcount = 0

                for (address of romhacks.offsetsInRomOf100ItemPlms) {
                    let fromAddress = address
                    let toAddress
                    if (('0x' + fromAddress.toString(16)) in romhacks.unhundo.sm_to_unhundo_remapping) {
                        toAddress = parseInt(romhacks.unhundo.sm_to_unhundo_remapping['0x' + fromAddress.toString(16)])
                    } else {
                        toAddress = fromAddress
                    }
                    // get the item!
                    let itemid = loadedroms['rando'].allbytes[fromAddress] + loadedroms['rando'].allbytes[fromAddress+1]*256 // convert plm from little endian
                    let newitem

                    // check for both types of 'nothing item plm' from VARIA rando - see https://github.com/theonlydude/RandomMetroidSolver/blob/master/patches/common/src/nothing_item_plm.asm
                    if (itemid === 0xbae9 || /* new 2023 */ itemid == 0xbad1) {
                        // 'nothing' chozo item, or, 'nothing' item in the open (they're one and the same,
                        // either may use either of the above itemids in varia depending on version)
                        // draw empty and delete, see comments on 0xbae9 from rotation, this is a bit hacky
                        newitem = 0xe0df
                    } else if (itemid === 0xbaed || /* new 2023 */ itemid == 0xbad5) {
                        // hidden 'nothing', see comments on 0xbaed from rotation, this is a bit hacky
                        newitem = 0xef83
                        itempatches.push({address: toAddress+4, type: 'overwrite',
                                          bytes: [0x05, 0x20].reverse()})
                    } else {
                        newitem = itemid
                    }
                    itempatches.push({address: toAddress, type: 'overwrite',
                                      bytes: [(newitem & 0xff), (newitem >> 8) & 0xff]})
                    // check for race mode
                    if (itemid === 0xef03 || itemid === 0xef57 || itemid === 0xefab) {
                        springballcount++
                    }
                    if (springballcount > 5) {
                        console.log('Error: Cannot read items from a Race-Mode protected rando ROM!!')
                        return []
                    }
                }
            }

            let patches = []

            if (itempatches.length != 0) {
                itempatches[0].description = 'copying items from rando rom'
                patches.push(...itempatches)
            }

            // items are done. now do a select few code patches that make things suck less!
            patches.push(...generalpatches.all()) // requires that html has loaded generalpatches.js

            patches.push(...romfeatures.maxAmmoDisplay) // requires that html has loaded romfeatures.js
            patches.push(...romfeatures.suitPickupsNowPreserveSamusLocation)

            // unhundo-specific code patches
            patches.push(...romhacks.unhundo.allpatches())

            return patches
        },

        allpatches: function() {
            let patches = []

            // solve the morph ball location item not appearing until zebes is asleep, as it may not be a morph ball:
            // we move the ROM location of morph ball (or whatever item's there at its location now) in morph ball room
            // part 2 of 2 moving it:
            // plain unhundo.ips adds a plm population here in free space for its 'zebes awake' state:
            //
            //          (several dozen plms' worth of free space 0xff) <-- we will add here
            // 0x7ea80: scroll plm
            //          scroll plm
            //          ...
            // 0x7eae0: gray door plm <-- we will change here
            // 0x7eae6: blue brin pb's plm
            // 0x7eaec: 00, 00 (null terminator)
            //          (several dozen plms' worth of free space 0xff)
            //
            // we'll take advantage of the fact that this plm population is almost the same as that of the default
            // room state in the hack.
            // the only differences?
            // 1) gray door is exclusive to 'zebes awake' state, and
            // 2) 'zebes awake' state has pb's, no morph. default state has morph, no pb's.
            // solution:
            // - point default state to 'zebes awake' state
            // - put both items in 'zebes awake' state
            // - move gray door to 6 bytes BEFORE the start of the 'zebes awake' state
            // - point 'zebes awake' state to the gray door, so it is the only difference between the states
            // - move morph-showing logic to PLM code
            patches.push(...[
                         {address: 0x79ec5, // address of plm population pointer word within state header for room's default state
                          type: 'overwrite',
                          description: 'solve morph ball location item not appearing until zebes is asleep',
                          bytes: [0xea, 0x80].reverse() /* pop. pointer value = 0x7ea80 */},
                         {address: 0x79edf, // address of plm population pointer word within state header for room's 'zebes awake' state
                          type: 'overwrite',
                          bytes: [0xea, 0x7a].reverse() /* pop. pointer value = 0x7ea7a */},
                         {address: 0x7ea7a,
                          type: 'freespace',
                          bytes: [[0xc8, 0x48].reverse() /* gray door plm id */, 0x01, 0x26 /* x, y */, [0x0c, 0x31].reverse() /* plm param */].flat()},
                         {address: 0x7eae0 + 2, // skip 2 bytes for plm id of whatever is at our new morph ball location (overwritten separately)
                          type: 'overwrite',
                          bytes: [0x45, 0x29 /* x, y */, [0x00, 0x1a].reverse() /* plm param */]},
                         ].flat())
            patches.push(...[
                         {address: 0x263fb, // hook morph open plm instruction list
                          type: 'overwrite',
                          description: 'new morph ball behavior if you have other items',
                          bytes: [0xf2, 0x06].reverse()}, // call $84:f206 instead of $84:887C
                         {address: 0x268a8, // hook morph chozo plm instruction list
                          type: 'overwrite',
                          bytes: [0xf2, 0x06].reverse()}, // call $84:f206 instead of $84:887C
                         {address: 0x26ddc, // hook morph shot block plm instruction list
                          type: 'overwrite',
                          bytes: [0xf2, 0x06].reverse()}, // call $84:f206 instead of $84:887C
                         {address: 0x27200, // $84:f200 : freeze plm forever (instruction list)
                          type: 'freespace',
                          bytes: [[0xe0, 0x4f].reverse(), // plm instruction list: draw frame 1
                                  [0x87, 0x24].reverse(), [0xf2, 0x00].reverse(), // goto draw frame 1 (forever). freezes frame of item, not obtainable
                                  ].flat()},
                         {address: 0x2f000, // $85:f000 : set carry if any items, clear carry if only equipment is morph (or nothing). assumes registers are 16-bit
                          type: 'freespace',
                          bytes: ['sec', // (remember not to do any addition or this default return value will get cleared!)
                                  0xaf /* lda.l absolute */, [0x7e, 0x09, 0xc8].reverse(), // $09c8: samus max missiles
                                  0x0f /* ora.l absolute */, [0x7e, 0x09, 0xcc].reverse(), // $09cc: samus max supers
                                  0x0f /* ora.l absolute */, [0x7e, 0x09, 0xd0].reverse(), // $09d0: samus max pb's
                                  0x0f /* ora.l absolute */, [0x7e, 0x09, 0xd4].reverse(), // $09d4: samus max reserve
                                  0x0f /* ora.l absolute */, [0x7e, 0x09, 0xa8].reverse(), // $09a8: collected beams
                                  'beq', 1,
                                  'rtl', // return if any missiles/supers/pb's/beams
                                  0xaf /* lda.l absolute */, [0x7e, 0x09, 0xa4].reverse(), // $09a4: collected items
                                  0x89 /* bit imm */, [0xff, 0xfb].reverse(), // ~0x0004
                                  'beq', 1, // continue iff collected items == 0x0004 (morph and nothing else) or 0
                                  'rtl',
                                  0xaf /* lda.l absolute */, [0x7e, 0x09, 0xc4].reverse(), // $09c4: max health
                                  0x49 /* eor imm */, [0x00, 0x63].reverse(),
                                  'beq', 1, // continue iff max health == 99
                                  'rtl',
                                  'clc', // return carry cleared, indicating 'morph only' condition is satisfied
                                  'rtl',
                                  ].flat()},
                         {address: 0x27206, // $84:f206 : if samus has more than morph, freeze frame, make item unobtainable.
                                           //            else, do normal check for room argument item set (goto [[Y]] if so),
                                           //                  vs not set (fall through to next instruction in list if so)
                                           // use $f206, (pointer) in place of $887C, (pointer)
                          type: 'freespace',
                          bytes: ['jsl', [0x85, 0xf0, 0x00].reverse(), // detect loadout using above function
                                  'bcc', 4,
                                  0xa0 /* ldy imm */, [0xf2, 0x00].reverse(), // if carry set, goto plm instruction list $84:f200 : freeze plm forever
                                  'rts',
                                  0x20 /* jsr */, [0x88, 0x7c].reverse(), // call ($84:)$887C: go to [[Y]] if the room argument item is set
                                  'rts',
                                  ].flat()}
                         ])

            return patches
        },
    },
    // end unhundo

    zfactor: {
        sm_to_zf_mapping: {
        // mapping contributed by ironrusty:
        // from a WIP spreadsheet based on where's locked by what in varia vanilla 'newbie' logic
        // sm    :  zfactor item
        // string is the way of making hex json compatible, lowercasing matches js toString(16) (important)
        // note to self: s/\(.*\)	\(.*\)	\(.*\)	\(.*\)/    '0X\2': '0X\4',/
        '0x781cc': '0x7d6ef',
        '0x781e8': '0x7d975',
        '0x781ee': '0x7c911',
        '0x781f4': '0x7cc8d',
        '0x78248': '0x7cf47',
        '0x78264': '0x7c9f1',
        '0x783ee': '0x7c98f',
        '0x78404': '0x7c895',
        '0x78432': '0x7c949',
        '0x78464': '0x7cda3',
        '0x7846a': '0x7cda9',
        '0x78478': '0x7cd3d',
        '0x78486': '0x7cea7',
        '0x784ac': '0x7ce6f',
        '0x784e4': '0x7ce07',
        '0x78518': '0x7cbdd',
        '0x7851e': '0x7cbd7',
        '0x7852c': '0x7cd37',
        '0x78532': '0x7c995',
        '0x78538': '0x7cddf',
        '0x78608': '0x7c8e5',
        '0x7860e': '0x7cc55',
        '0x78614': '0x7ce23',
        '0x7865c': '0x7cd9b',
        '0x78676': '0x7cd6b',
        '0x786de': '0x7cbf1',
        '0x7874c': '0x7ceaf',
        '0x78798': '0x7cbeb',
        '0x7879e': '0x7ca1b',
        '0x787c2': '0x7cd95',
        '0x787d0': '0x7cc47',
        '0x787fa': '0x7c9e9',
        '0x78802': '0x7cc11',
        '0x78824': '0x7cdd1',
        '0x78836': '0x7d859',
        '0x7883c': '0x7d879',
        '0x78876': '0x7cc4f',
        '0x788ca': '0x7d27d',
        '0x7890e': '0x7d2e3',
        '0x78914': '0x7c943',
        '0x7896e': '0x7cf33',
        '0x7899c': '0x7cf2b',
        '0x789ec': '0x7d251',
        '0x78aca': '0x7d305',
        '0x78ae4': '0x7d2ff',
        '0x78b24': '0x7d461',
        '0x78b46': '0x7cd57',
        '0x78ba4': '0x7d375',
        '0x78bac': '0x7ced5',
        '0x78bc0': '0x7cfab',
        '0x78be6': '0x7cbb5',
        '0x78bec': '0x7ce0d',
        '0x78c04': '0x7d389',
        '0x78c14': '0x7d403',
        '0x78c2a': '0x7d68d',
        '0x78c36': '0x7d7e1',
        '0x78c3e': '0x7d333',
        '0x78c44': '0x7d361',
        '0x78c52': '0x7d573',
        '0x78c66': '0x7d2ab',
        '0x78c74': '0x7d40b',
        '0x78c82': '0x7d421',
        '0x78cbc': '0x7d443',
        '0x78cca': '0x7d4b5',
        '0x78e6e': '0x7d07f',
        '0x78e74': '0x7d2eb',
        '0x78f30': '0x7d39d',
        '0x78fca': '0x7d73b',
        '0x78fd2': '0x7d3d7',
        '0x790c0': '0x7cfd1',
        '0x79100': '0x7d4ed',
        '0x79108': '0x7d20b',
        '0x79110': '0x7cffd',
        '0x79184': '0x7d77b',
        '0x7c265': '0x7d8f9',
        '0x7c2e9': '0x7ccff',
        '0x7c2ef': '0x7d52d',
        '0x7c319': '0x7d71b',
        '0x7c337': '0x7d9f1',
        '0x7c357': '0x7c9ab',
        '0x7c365': '0x7cb2b',
        '0x7c36d': '0x7d5ed',
        '0x7c437': '0x7d967',
        '0x7c43d': '0x7dc19',
        '0x7c47d': '0x7dbd9',
        '0x7c483': '0x7d9a7',
        '0x7c4af': '0x7d989',
        '0x7c4b5': '0x7dac5',
        '0x7c533': '0x7da55',
        '0x7c559': '0x7d93b',
        '0x7c5dd': '0x7da81',
        '0x7c5e3': '0x7da15',
        '0x7c5eb': '0x7dbe7',
        '0x7c5f1': '0x7d9cb',
        '0x7c603': '0x7dc2d',
        '0x7c609': '0x7dbd1',
        '0x7c6e5': '0x7ce15',
        '0x7c74d': '0x7db7d',
        '0x7c755': '0x7d923',
        '0x7c7a7': '0x7dabd',
        },
        zf_unmodified_except_sram_bit: [ // cover 113 locations (100+these 13 which will appear as vanilla romhack.. except we modify the last 3's identity. first 10 of these are 7 missiles, 2 super packs, and 1 e tank)
            '0x7C9BF', '0x7CC2D', '0x7CC95', '0x7D2C1', '0x7D13B', '0x7D133', '0x7D087', '0x7DA1B', '0x7DAD9', '0x7DB51', '0x7d7e9', '0x7d7ef', '0x7d7f5',
        ],

        patchmain: function ({hasRoms = true, loadedroms = {}} = {}) {

            let itempatches = []

            if (hasRoms) {
                let springballcount = 0
                for (fromAddressString in romhacks.zfactor.sm_to_zf_mapping) {
                    let fromAddress = parseInt(fromAddressString)
                    let itemid = loadedroms['rando'].allbytes[fromAddress] + loadedroms['rando'].allbytes[fromAddress+1]*256 // convert plm from little endian

                    // check for both types of 'nothing item plm' from VARIA rando - see https://github.com/theonlydude/RandomMetroidSolver/blob/master/patches/common/src/nothing_item_plm.asm
                    if (itemid === 0xbae9 || /* new 2023 */ itemid == 0xbad1) {
                        // 'nothing' chozo item, or, 'nothing' item in the open (they're one and the same,
                        // either may use either of the above itemids in varia depending on version)
                        // draw empty and delete, see comments on 0xbae9 from rotation, this is a bit hacky
                        newitem = 0xe0df
                    } else if (itemid === 0xbaed || /* new 2023 */ itemid == 0xbad5) {
                        // hidden 'nothing', see comments on 0xbaed from rotation, this is a bit hacky
                        newitem = 0xef83
                        itempatches.push({address: parseInt(romhacks.zfactor.sm_to_zf_mapping[fromAddressString])+4, type: 'overwrite',
                                          bytes: [0x05, 0x20].reverse()})
                    } else {
                        newitem = itemid
                    }
                    itempatches.push({address: parseInt(romhacks.zfactor.sm_to_zf_mapping[fromAddressString]), type: 'overwrite',
                                      bytes: [(newitem & 0xff), (newitem >> 8) & 0xff]})
                    // check for race mode
                    if (itemid === 0xef03 || itemid === 0xef57 || itemid === 0xefab) {
                        springballcount++
                    }
                    if (springballcount > 5) {
                        console.log('Error: Cannot read items from a Race-Mode protected rando ROM!!')
                        return []
                    }
                }
            }

            let patches = []

            if (itempatches.length != 0) {
                itempatches[0].description = 'copying items from rando rom'
                patches.push(...itempatches)
            }

            patches.push(...generalpatches.all()) // requires that html has loaded generalpatches.js

            patches.push(...romfeatures.maxAmmoDisplay) // requires that html has loaded romfeatures.js
            patches.push(...romfeatures.suitPickupsNowPreserveSamusLocation)

            // z-factor specific:
            // change identity of the 3 fixed 'super secret items' for backdooring WS before phantoon (very z-factor specific, avoiding OP skip)
            patches.push({address: 0x7d7e9, type: 'overwrite', bytes: [0xee, 0xdb].reverse(), description: 'nerf super secret room'}) // missile
            patches.push({address: 0x7d7ef, type: 'overwrite', bytes: [0xee, 0xdf].reverse()}) // super pack
            patches.push({address: 0x7d7f5, type: 'overwrite', bytes: [0xee, 0xe3].reverse()}) // pb pack

            return patches
        },
    },
    //end zfactor
}
