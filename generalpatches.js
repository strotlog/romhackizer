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
    // fix obscure vanilla bug where turning off spring ball while bouncing can crash in $91:EA07:
    // overwrite unreachable code at $91:fc4a (due to pose 0x65 not existing).
    // translate RAM $0B20 values #$0601 and #$0602 (seem spring ball related)
    // to valid array indices #$0001 and #$0002, respectively (values expected by $91:EA07)
                 {address: 0x8ea07, type: 'overwrite', description:'fix spring ball crash',
                  bytes: ['jsl', [0x91, 0xfc, 0x4a].reverse()].flat()}, // jsl $91:fc4a
                 {address: 0x8fc4a, type: 'overwrite',
                  bytes: [0xad /* lda */, [0x0B, 0x20].reverse(), // LDA $0B20: Used for bouncing as a ball when you land
                          0x29 /* and imm */, [0x00, 0xff].reverse(), // low byte only
                          0x0a /* asl A (ie, A*=2) */,
                          'rtl'
                          ].flat()}
    ],

    all: function() {
        patches = []
        patches.push(...generalpatches.fixMorphPickupBug)
        patches.push(...generalpatches.balancedSuits)
        patches.push(...generalpatches.screwAttackMenu)
        patches.push(...generalpatches.blueDuringHeat)
        patches.push(...generalpatches.springBallCrash)
        return patches
    },

}
