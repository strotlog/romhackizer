var generalpatches = {

    fixMorphPickupBug : [
    // per http://patrickjohnston.org/bank/84#fE3EF,
    // there is a vanilla bug in normally unused code.  picking up a hidden morph ball or a chozo morph ball will result in you getting spring ball instead (lol).
    // this vanilla bug is not fixed in sm rotation (cause why would it be) so let's fix it here!
    // fix morph in chozo orb. 0x04=morph item-having bit. was 2=spring:
                 {address: 0x268ce, type: 'overwrite', description:'fix morph pickup bug',
                  bytes: [0x04]},
    // fix morph in hidden aka shot block. 0x04=morph item-having bit. was 2=spring:
                 {address: 0x26e02, type: 'overwrite',
                  bytes: [0x04]}
    ],

    balancedSuits : [
    // remove gravity's heat protection:
                 {address: 0x6e37d, type: 'overwrite', description:'balanced suits',
                  bytes: [0x01]},
    // replace the code where environmental damage calculation looks for gravity suit, with varia suit instead (in function $90:E9CE). gravity does nothing for enviro now:
                 {address: 0x869dd, type: 'overwrite',
                  bytes: [0x01]}
    ],
    
    screwAttackMenu: [
    // fix well known vanilla menu bug (patrickjohnston.org) "Bug: $82:B4C4 should be CPX #$000C. Can't access Screw Attack without Spring Ball or Boots"
                 {address: 0x134c5, type: 'overwrite', description:'fix screw attack menu select',
                  bytes: [0x00, 0x0c].reverse()}
    ],

    blueDuringHeat: [
    // fix well known vanilla bluespeed in heatedroom bug (patrickjohnston.org):
    //  "$90:852C . . . BUG: This overwrites A with the number of sounds queued if the queue is not full
    //  "Causing the index for the $91:B61F table to be 5 sometimes, which [is] greater than the table size,
    //  "which causes the blue suit [to] fail when boosting sometimes (mostly in heated rooms)"
    // we expand the table to overlap with beginning of enormous $91:B629 Pose definitions table by setting a
    // harmless/unused 'Pose X direction' bit in entry 0 to $02 thus making $91:B61F[4] == $91:B61F[5]
    // (index 4 = speed boosting, index 5 = bugged)
                 {address: 0x8b629, type: 'overwrite', description:'prevent losing blue due to heat sound',
                  bytes: [0x02]}
    ],

    springBallCrash: [
    // fix obscure vanilla bug where: turning off spring ball while bouncing, can crash in $91:EA07,
    // or exactly the same way as well in $91:F1FC:
    // fix buffer overrun. overwrite nearby unreachable code at $91:fc4a (due to pose 0x65 not existing).
    // translate RAM $0B20 values:
    // #$0601 (spring ball specific value) --> #$0001
    // #$0602 (spring ball specific value) --> #$0002
    // thus loading a valid jump table array index in these two buggy functions
                 {address: 0x8ea07, type: 'overwrite', description:'fix spring ball crash',
                  bytes: ['jsl', [0x91, 0xfc, 0x4a].reverse()].flat()}, // jsl $91:fc4a
                 {address: 0x8f1fc, type: 'overwrite',
                  bytes: ['jsl', [0x91, 0xfc, 0x4a].reverse()].flat()}, // jsl $91:fc4a
                 {address: 0x8fc4a, type: 'overwrite',
                  bytes: [0xad /* lda */, [0x0B, 0x20].reverse(), // LDA $0B20: Used for bouncing as a ball when you land
                          0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only
                          0x0a /* asl A (ie, A*=2) */,
                          'rtl'
                          ].flat()}
    ],

    linkedSupersCrash: [
    // fix vanilla crash bug that seems to come into play in rotation when lining up the 2 metal space pirates together and supering them a bunch
                 // part 1: wrap call from $90:BE45 (projectile reflection) -> $90:ADB7 (clear projectile)
                 {address: 0x83e45, type: 'overwrite', description:'fix linked supers crash on metal pirates',
                  bytes: ['jsl', [0x90, 0xf7, 0x00].reverse(), // jsl to new function $90:f700
                          'bra', 0x02,
                          'nop', 'nop'
                          ].flat()},
                 {address: 0x87700, type: 'freespace',
                  bytes: [ // perform link bit check and bounds checking on just-loaded $0c7c,x
                          0x89 /* bit imm */, [0xff, 0x00].reverse(), // bit #$ff00
                          'beq', 0xd, // no link bit? leave
                          0x29 /* and imm */, [0x00, 0xff].reverse(), // and #$00ff
                          0xc9 /* cmp imm */, [0x00, 0x09].reverse(), // cmp #$0009
                          'bpl', 0x5, // last valid byte offset into projectile arrays is 8, if beyond this just return
                          'tax',
                          'jsl', [0x90, 0xad, 0xb7].reverse(), // jsl $90:ADB7: Clear projectile X
                          'rtl'
                          ].flat()},
                 // part 2: wrap call from $90:B324 -> $90:BF46 (initialize new linked super)
                 {address: 0x83324, type: 'overwrite',
                  bytes: [0x20 /* jsr */, [0xf7, 0x20].reverse() // jsr to new function $90:f720. (not enough room between branches to conveniently jsl)
                          ].flat()},
                 {address: 0x87720, type: 'freespace',
                  bytes: [0x20 /* jsr */, [0xbf, 0x46].reverse(),
                          0xe0 /* cpx imm */, [0x0, 0xa].reverse(),
                          'bne', 0x6, // return if X != #$000A
                          // X==#$000A after running $90:BF46, this is not a valid index and, though it's a somewhat of
                          // an inference, it should only mean that all 5 projectile slots were full.
                          // the linked super therefore failed to spawn.
                          // so $0c7c,X has bit #$0100 set but points to a completely invalid linked super projectile
                          // index in the low byte.
                          // get rid of the link!
                          0xa2, /* ldx */ [0x0d, 0xde].reverse(), // LDX $0DDE: Projectile index (byte offset)
                          0x9e /* stz relative */, [0xc, 0x7c].reverse(), // STZ $0c7c,x
                          'rts'
                          ].flat()}
    ],

    all: function() {
        patches = []
        patches.push(...generalpatches.fixMorphPickupBug)
        patches.push(...generalpatches.balancedSuits)
        patches.push(...generalpatches.screwAttackMenu)
        patches.push(...generalpatches.blueDuringHeat)
        patches.push(...generalpatches.springBallCrash)
        patches.push(...generalpatches.linkedSupersCrash)
        return patches
    },

}
