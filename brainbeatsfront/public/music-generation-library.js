var MidiWriter = require('midi-writer-js')
const fs = require('fs');

const brainwaves = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
// const commonNoteGroupings = [1, 2, 3, 4, 6, 8]; // These are hardcoded values pls don't change
// const commonNoteDurations = ['2', '4', '8', '8t', '16', '16t'];  // These are hardcoded values pls don't change
const commonNoteGroupings = [6, 3, 1, 2, 4]; // Ideally keep to five or more
const commonNoteDurations = ['1', '2', '4', '8', '16']; // Ideally keep to five or more

const DEBUG = false;

// TODO: Mean aggregate of the EEG data

function musicGenerationDriver(musicGenerationModel, scaleNoteArray, octaveArray, eegDataPoint, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot, scaleMap) {
    track = new MidiWriter.Track();
    console.log("musicGenerationDriver, model: " + musicGenerationModel + " scales: " + scaleNoteArray + " octaveArray: " + octaveArray + " secondsPerEEGSnapShot: " + secondsPerEEGSnapShot + " noteDurationsPerBeatPerSecond: ");
    console.log(eegDataPoint['band_values']);

    if (musicGenerationModel == 1) {
        // TODO: Stretch goal: Should this handle loudness?
        track = mapAggregateBandPowerToRandomProbability(track, eegDataPoint, scaleNoteArray, octaveArray, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot);
    } else if (musicGenerationModel == 2) {
        // track = buildMarkovModel(track, eegDataPoint, scaleNoteArray, octaveArray, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot);
    } else {
        noteEvents = createNotes(secondsPerEEGSnapShot, scaleMap);
        track = addNotesToTrack(track, noteEvents);
    }

    return track;
}

function buildMarkovModel(track, eegDataQueue, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot) {
    console.log("Music Generation Model 2: Blues Markov Chain");

    eegDataQueue.forEach(eegDataPoint => {
        // 1. Calculate percents and determine outcome ranges for each component of what makes a note!
        var durationRanges = getOutcomeRanges(eegDataPoint, commonNoteDurations);
        var groupingsRanges = getOutcomeRanges(eegDataPoint, commonNoteGroupings);

        // 2. Determine the randomly selected durations and groupings and calculate it based off of seconds noteDurationsPerBeatPerSecond, secondsForThisSnapshot
        // Build notes, save how long the notes last, until there are no more seconds or can't make even the shortest note combo:
        var noteEvents = [];
        var finalNotes = getMarkovBluesModelNotes(noteEvents, eegDataPoint, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot, durationRanges, groupingsRanges);

        // 3. Build track!
        track = addNotesToTrack(track, finalNotes);
    });

    return track;
}

// Markov chain-based blues composition
function getMarkovBluesModelNotes(noteEvents, eegDataPoint, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot, durationRanges, groupingsRanges) {
    console.log("Beginning markov model");
    
    // 1. Determine the shortest note we can generate
    var shortestNoteCombo = getSecondsForNote('16', 3, noteDurationsPerBeatPerSecond);
    
    while (secondsPerEEGSnapShot > 0 && secondsPerEEGSnapShot > shortestNoteCombo) {
        // 2. Determine the random outcomes for the duration & groupings
        /*
        var randomNumber = getRandomTwoPlaceDecimalZeroThruHundred();
        var curDurationOutcome = getRandomOutcome(randomNumber, durationRanges);
        var curGroupingOutcome = getRandomOutcome(randomNumber, groupingsRanges);
        */
        var curDurationOutcome = durationRanges[Math.floor(Math.random() * durationRanges.length)]['outcome'];
        var curGroupingOutcome = groupingsRanges[Math.floor(Math.random() * groupingsRanges.length)]['outcome'];

        // 3. Determine the amount of seconds for the note duration and grouping randomly produced. 
        var currentSeconds = getSecondsForNote(curDurationOutcome, curGroupingOutcome, noteDurationsPerBeatPerSecond);
        // var currentSeconds = (1/curDurationOutcome * curGroupingOutcome * noteDurationsPerBeatPerSecond);

        // 4. Build the Notes: 
        // 4a. If the note duration & grouping is shorter than how many seconds this snapshot needs to produce, then add the notes and update the time!

        /* This is where the magic happens... */
        if (currentSeconds <= secondsPerEEGSnapShot) {
            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getNextMarkovNote(noteEvents, eegDataPoint),  
                duration: curDurationOutcome.toString(),
                repeat: Number(curGroupingOutcome),
            }));
            secondsPerEEGSnapShot -= currentSeconds;
        }

        // 4b. If currentSeconds is greater than remaining secondsPerEEGSnapShot but they are within 1 second of each other, just go with the note and update the time!
        if (currentSeconds > secondsPerEEGSnapShot && (currentSeconds - secondsPerEEGSnapShot) <= 1) {
            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getNextMarkovNote(noteEvents, eegDataPoint),  
                duration: curDurationOutcome.toString(),
                repeat: Number(curGroupingOutcome),
            }));
            secondsPerEEGSnapShot -= currentSeconds;
            secondsPerEEGSnapShot = secondsPerEEGSnapShot > 0 ? secondsPerEEGSnapShot : 0;
        }

        // 4c. If we are very close to the shortestNoteCombo we can make, just make that note and end it!
        if (secondsPerEEGSnapShot <= shortestNoteCombo * 1.5) {
            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getNextMarkovNote(noteEvents, eegDataPoint),  
                duration: curDurationOutcome.toString(),
                repeat: 1,
            }));
            secondsPerEEGSnapShot = 0;
        }
    }

    return noteEvents;
}

function getNextMarkovNote(noteEvents, eegDataPoint) {
    var bluesScale = ["C3", "Eb3", "F3", "F#3", "G3", "Bb3", "C4", "Eb4", "F4", "F#4", "G4", "Bb4", "C5"];
    
    var lastNote;
    
    if (noteEvents.length == 0) {
        lastNote = "C3";
    } else {
        lastNote = noteEvents.at(-1)['pitch'][0];
    }
    
    var lastNoteIndex = bluesScale.indexOf(lastNote);
    
    var nextNote; 
    var nextNoteIndex; 
    var selector;
    
    var alpha = eegDataPoint['band_values']['alpha'];
    console.log(alpha);
    
    if (alpha < 93) {
        selector = 1;
    } else if (alpha < 93.5) {
        selector = 2;
    } else if (alpha < 94) {
        selector = 3;
    } else if (alpha < 94.5) {
        selector = 4;
    } else if (alpha < 95) {
        selector = 5;
    } else {
        selector = 6;
    }
    
    
    if (selector == 1) {
        nextNoteIndex = lastNoteIndex + 1;
    } else if (selector == 2) {
        nextNoteIndex = lastNoteIndex + 2;
    } else if (selector == 3) {
        nextNoteIndex = lastNoteIndex + 4; 
    } else if (selector == 4) {
        nextNoteIndex = lastNoteIndex + 6; 
    } else if (selector == 5) {
        nextNoteIndex = lastNoteIndex - 2;
    } else if (selector == 6) {
        nextNoteIndex = lastNoteIndex - 4; 
    }

    if (nextNoteIndex > bluesScale.length) {
        nextNoteIndex = nextNoteIndex % bluesScale.length;
    }
    nextNote = bluesScale[nextNoteIndex];

    return [nextNote];
}


function mapAggregateBandPowerToRandomProbability(track, eegDataPoint, scaleNoteArray, octaveArray, noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot) {
    console.log("Music Generation Model 1: Map Aggregate Band Power To Random Probability");

    // 1. Calculate percents and determine outcome ranges for each component of what makes a note!
    var durationRanges = getOutcomeRanges(eegDataPoint, commonNoteDurations);
    var groupingsRanges = getOutcomeRanges(eegDataPoint, commonNoteGroupings);
    var octaveRanges = getOutcomeRanges(eegDataPoint, octaveArray);
    var scaleNoteRanges = getOutcomeRanges(eegDataPoint, scaleNoteArray);

    // 2. Determine the randomly selected durations and groupings and calculate it based off of seconds noteDurationsPerBeatPerSecond, secondsForThisSnapshot
    var finalNotes = getRandomFinalNotesBasedOnTime(noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot, durationRanges, groupingsRanges, scaleNoteRanges, octaveRanges);

    // 3. Build track!
    track = addNotesToTrack(track, finalNotes);

    return track;
}

function getRandomFinalNotesBasedOnTime(noteDurationsPerBeatPerSecond, secondsPerEEGSnapShot, durationRanges, groupingsRanges, scaleNoteRanges, octaveRanges) {
    // 1. Determine the shortest note we can generate
    var shortestNoteCombo = getSecondsForNote('16', 3, noteDurationsPerBeatPerSecond);

    // Build notes, save how long the notes last, until there are no more seconds or can't make even the shortest note combo:
    var noteEvents = [];
    while (secondsPerEEGSnapShot > 0 && secondsPerEEGSnapShot > shortestNoteCombo) {

        // 2. Determine the random outcomes for the duration & groupings
        var randomNumber = getRandomTwoPlaceDecimalZeroThruHundred();
        var curDurationOutcome = getRandomOutcome(randomNumber, durationRanges);
        var curGroupingOutcome = getRandomOutcome(randomNumber, groupingsRanges);

        // 3. Determine the amount of seconds for the note duration and grouping randomly produced. 
        var currentSeconds = getSecondsForNote(curDurationOutcome, curGroupingOutcome, noteDurationsPerBeatPerSecond);
        console.log("Total sec: " + secondsPerEEGSnapShot + ", curSec " + currentSeconds + ", curDuration " + curDurationOutcome + ", curGrouping " + curGroupingOutcome);

        // 4. Build the Notes: 
        // 4a. If the note duration & grouping is shorter than how many seconds this snapshot needs to produce, then add the notes and update the time!
        if (currentSeconds <= secondsPerEEGSnapShot) {

            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getRandomOutcome(randomNumber, scaleNoteRanges),
                duration: curDurationOutcome.toString(),
                repeat: Number(curGroupingOutcome),
            }));
            secondsPerEEGSnapShot -= currentSeconds;
        }

        // 4b. If currentSeconds is greater than remaining secondsPerEEGSnapShot but they are within 1 second of each other, just go with the note and update the time!
        if (currentSeconds > secondsPerEEGSnapShot && (currentSeconds - secondsPerEEGSnapShot) <= 1) {
            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getRandomOutcome(randomNumber, scaleNoteRanges),
                duration: curDurationOutcome.toString(),
                repeat: Number(curGroupingOutcome),
            }));
            secondsPerEEGSnapShot -= currentSeconds;
            secondsPerEEGSnapShot = secondsPerEEGSnapShot > 0 ? secondsPerEEGSnapShot : 0;
        }

        // 4c. If we are very close to the shortestNoteCombo we can make, just make that note and end it!
        if (secondsPerEEGSnapShot <= shortestNoteCombo * 1.5) {
            noteEvents.push(new MidiWriter.NoteEvent({
                pitch: getRandomOutcome(randomNumber, scaleNoteRanges),
                duration: '16'.toString(),
                repeat: 3,
            }));
            secondsPerEEGSnapShot = 0;
        }
    }

    return noteEvents;
}

function getSecondsForNote(curDuration, curGrouping, noteDurationsPerBeatPerSecond) {
    let curNoteDuration = noteDurationsPerBeatPerSecond.find(o => o.duration === curDuration);
    console.log("Note duration: ");
    console.log(curNoteDuration);
    
    var curNoteDurationSec = curNoteDuration.seconds;
    return curNoteDurationSec * curGrouping;
}

function getRandomTwoPlaceDecimalZeroThruHundred() {
    var precision = 1000; // 2 decimals
    var randomNum = Math.floor(Math.random() * (101 * precision - 1 * precision) + 1 * precision) / (1 * precision);
    return randomNum;
}

function getRandomOutcome(randomNumber, ranges) {
    var outcomeValue;
    for (let i = 0; i < ranges.length; i++) {
        var cur = ranges[i];
        if (cur.lowerRange <= randomNumber && cur.upperRange >= randomNumber) {
            outcomeValue = cur.outcome;
            break;
        }
    }

    return outcomeValue;
}

function getMaxBrainwaveName(bandPowers) {
    var maxBrainwaveName = "";
    var max = 0;

    for (var brainwave in bandPowers) {
        if (bandPowers.hasOwnProperty(brainwave) && bandPowers[brainwave] > max) {
            max = bandPowers[brainwave];
            maxBrainwaveName = brainwave;
        }
    }
    return maxBrainwaveName;
}

function getOutcomeRanges(eegData, outcomesArray) {
    var totalOutcomes = outcomesArray.length;
    if (totalOutcomes == 1) {
        return getOutcomeRangesForOne(eegData, outcomesArray);
    } else if (totalOutcomes > 1 && totalOutcomes < 5) {
        return getOutcomeRangesForMoreThanOneLessThanFive(eegData, outcomesArray);
    }

    // Assumes data is either one for one for brainwave data or can be split by the greatest brainwave
    return getOutcomeRangesForFiveOutcomesOrGreater(eegData, outcomesArray);
}

function getOutcomeRangesForOne(eegData, outcome) {
    var brainwaveRangesToOutcomes = [];

    brainwaveRangesToOutcomes.push({
        lowerRange: 0,
        upperRange: 100,
        outcome: outcome[0],
    });

    return brainwaveRangesToOutcomes;
}

function getOutcomeRangesForMoreThanOneLessThanFive(eegData, outcomesArray) {
    var bandPowerValues = eegData['band_values'];
    var numOutcomes = outcomesArray.length;
    var brainwavesToRemove = brainwaves.length - numOutcomes;

    // Map brainwave values to their brainwave names for easy retrieval later!
    var brainwaveDataMap = new Map();
    for (brainwave in bandPowerValues) {
        brainwaveDataMap.set(bandPowerValues[brainwave], brainwave);
    }

    // Sort the brainwave data from smallest to largest
    var brainwaveData = [bandPowerValues['delta'], bandPowerValues['theta'], bandPowerValues['alpha'], bandPowerValues['beta'], bandPowerValues['gamma']];
    brainwaveData.sort(function (a, b) {
        return a - b;
    });

    // Calculate the total: 
    var totalBandPower = 0;
    for (let i = brainwavesToRemove; i < brainwaveData.length; i++) {
        totalBandPower += brainwaveData[i];
    }
    totalBandPower = roundTwoDecimalPoints(totalBandPower);

    // Build the outcome map
    var brainwaveRangesToOutcomes = [];
    var curLowerRange = 0, outcomeIndex = 0;
    for (let i = brainwavesToRemove; i < brainwaveData.length; i++) {
        var curBrainwavePercent = roundTwoDecimalPoints(brainwaveData[i] / totalBandPower * 100);
        var curUpperRange = roundTwoDecimalPoints(curLowerRange + curBrainwavePercent);

        // If we are at the last option, just make sure it's upperRange is 100.
        if (i == brainwaveData.length - 1) curUpperRange = 100.00;


        brainwaveRangesToOutcomes.push({
            brainwave: brainwaveDataMap.get(brainwaveData[i]),
            lowerRange: curLowerRange,
            upperRange: curUpperRange,
            outcome: outcomesArray[outcomeIndex],
        });

        curLowerRange = curUpperRange;
        outcomeIndex++;
    }

    return brainwaveRangesToOutcomes;
}

function getOutcomeRangesForFiveOutcomesOrGreater(eegData, outcomesArray) {
    var numOutcomes = outcomesArray.length;
    var bandPowerValues = eegData['band_values'];

    //  Determine the max, split the max brainwave into outcomes if needed
    var maxBrainwaveName = getMaxBrainwaveName(bandPowerValues);
    var howManyOctcomesMaxBrainwaveWillBeSplitInto = numOutcomes > brainwaves.length ? (numOutcomes - brainwaves.length + 1) : 0;
    var maxBrainwaveSplitValue = howManyOctcomesMaxBrainwaveWillBeSplitInto > 0 ? (roundTwoDecimalPoints(bandPowerValues[maxBrainwaveName] / howManyOctcomesMaxBrainwaveWillBeSplitInto)) : 0;

    // Get the totalBandPower to calculate percent later
    var totalBandPower = roundTwoDecimalPoints(bandPowerValues['delta'] + bandPowerValues['theta'] + bandPowerValues['alpha'] + bandPowerValues['beta'] + bandPowerValues['gamma']);
    var brainwaveData = [bandPowerValues['delta'], bandPowerValues['theta'], bandPowerValues['alpha'], bandPowerValues['beta'], bandPowerValues['gamma']];

    var brainwaveRangesToOutcomes = [];
    var curLowerRange = 0, brainwaveIndex = 0;
    for (let i = 0; i < numOutcomes; i++) {
        var curBrainwavePercent = 0;

        // Adjust percent values based on whether or not it needs be split 
        if (howManyOctcomesMaxBrainwaveWillBeSplitInto > 0 && maxBrainwaveName == brainwaves[brainwaveIndex]) {
            curBrainwavePercent = roundTwoDecimalPoints(maxBrainwaveSplitValue / totalBandPower * 100);
            howManyOctcomesMaxBrainwaveWillBeSplitInto--;
        } else {
            curBrainwavePercent = roundTwoDecimalPoints(brainwaveData[brainwaveIndex] / totalBandPower * 100);
        }

        var curUpperRange = roundTwoDecimalPoints(curLowerRange + curBrainwavePercent);

        // If we are at the last option, just make sure it's upperRange is 100.
        if (i == numOutcomes - 1) curUpperRange = 100.00;

        brainwaveRangesToOutcomes.push({
            brainwave: brainwaves[brainwaveIndex],
            lowerRange: curLowerRange,
            upperRange: curUpperRange,
            outcome: outcomesArray[i],
        });

        curLowerRange = curUpperRange;

        // If not on the brainwave that needs to be split & still splitting
        if (!(maxBrainwaveName == brainwaves[brainwaveIndex] && howManyOctcomesMaxBrainwaveWillBeSplitInto > 0)) {
            brainwaveIndex++;
        }
    }

    return brainwaveRangesToOutcomes;
}

function setInstrument(track, instrument_num) {
    track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instrument_num }));
    debug_print('Set instrument to track')
    return track;
}

function getBeatsPerSec(bpm) {
    return bpm / 60;
}

function getNoteDurationsPerBeatPerSecond(bpm, time_signature) {
    beatsPerSecond = getBeatsPerSec(bpm);
    beatValue = time_signature.split('/')[1];

    var noteDurationsPerBeatPerSecond = [];
    for (var i = 0; i < commonNoteDurations.length; i++) {
        var note = commonNoteDurations[i];
        var beatPerNoteDuration = roundTwoDecimalPoints(beatValue / note);

        // Update these values for triplets:
        if (note == '8t' || note == '16t') {
            note = note.substring(0, note.length - 1);
            beatPerNoteDuration = roundTwoDecimalPoints(beatValue / note * 3);
        }
        var numBeatPerNotePerSecond = roundTwoDecimalPoints(beatPerNoteDuration / beatsPerSecond);
        noteDurationsPerBeatPerSecond.push({
            duration: commonNoteDurations[i],
            beats: beatPerNoteDuration,
            seconds: numBeatPerNotePerSecond,
        });
    }
    return noteDurationsPerBeatPerSecond;
}

// Ideally will have further Note options and scales with more features added
function getScaleNotes(selection, scale, minRange, maxRange) {
    var notes = { C: 1, Db: 1.5, D: 2, Eb: 2.5, E: 3, F: 3.5, Gb: 4, G: 4.5, Ab: 5, A: 5.5, Bb: 6, B: 6.5 };
    var major = [1, 1, 0.5, 1, 1, 1, 0.5];
    var minor = [1, 0.5, 1, 1, 0.5, 1, 1];
    var chromatic = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    var pentatonic = [1, 1, 1.5, 1];
    var singular = [1, 1];
    var scale_to_use = [];
    var usable_notes = [];
    var finalnotes = [];
    var i = 0;
    var j = notes[selection];
    var max_steps = 0;
    switch (scale) {
        case "major":
            scale_to_use = major;
            max_steps = 7;
            break;
        case "minor":
            scale_to_use = minor;
            max_steps = 7;
            break;
        case "chromatic":
            scale_to_use = chromatic;
            max_steps = 12;
            break;
        case "pentatonic":
            scale_to_use = pentatonic;
            max_steps = 5;
            break;
        case "singular":
            scale_to_use = singular;
            max_steps = 1;
            break;
    }

    // Get usable notes within scale
    for (i = 0; i < max_steps; i++) {
        // Ensures that once a note reaches the end of octave it wraps around  
        if (j > 6.5) {
            j = (j - 6);
        }
        usable_notes.push(getKeyByValue(notes, j));
        j = j + scale_to_use[i];
    }
    // Set all available notes within range
    for (i = minRange; i <= maxRange; i++) {
        for (j = 0; j < usable_notes.length; j++) {
            debug_print(usable_notes[j] + i);
            finalnotes.push(usable_notes[j] + i);
        }
    }
    debug_print(finalnotes);
    return finalnotes;
}

function getScaleMap(key, scale, minRange, maxRange) {
    var scaleNotes = getScaleNotes(key, scale, minRange, maxRange);

    var scaleMap = new Map();
    for (let i = 0; i < scaleNotes.length; i++) {
        scaleMap.set(i, scaleNotes[i]);
    }
    debug_print('Scale Map');
    debug_print(scaleMap);
    return scaleMap;
}

function getOctaveRangeArray(minRange, maxRange) {

    var octaveRangeArray = [];
    for (let octave = minRange; octave < maxRange + 1; octave++) {
        octaveRangeArray.push(octave);
    }

    debug_print('Octave Range Array:');
    debug_print(octaveRangeArray);
    return octaveRangeArray;
}

// TODO: Reorganize this!
let createNoteDistribution = (numberOfNotesToGenerate, currentPitch) => {
    for (var j = 0; j < numberOfNotesToGenerate; j++) {
        distribution = [];
        // most common pitches will be one note up or one note down
        // Change current pitch by one
        for (var k = 0; k < 25; k++) {
            if (currentPitch > 1) {
                distribution.push(currentPitch - 1);
            } else {
                distribution.push(currentPitch + 1);
            }
        }

        for (var k = 0; k < 25; k++) {
            if (currentPitch < 5) {
                distribution.push(currentPitch + 1);
            } else {
                distribution.push(currentPitch - 1);
            }
        }
        // Change current pitch by 2
        for (var k = 0; k < 15; k++) {
            if (currentPitch < 4) {
                distribution.push(currentPitch + 2);
            } else {
                distribution.push(currentPitch - 2);
            }
        }

        for (var k = 0; k < 15; k++) {
            if (currentPitch > 2) {
                distribution.push(currentPitch - 2);
            } else {
                distribution.push(currentPitch + 2);
            }
        }

        // staying on the same note is also possible
        // Keep the same pitch
        for (var k = 0; k < 20; k++) {
            distribution.push(currentPitch);
        }
    }
    debug_print('note distribution');
    debug_print(distribution);
    return distribution;
}

function createNotes(totalNoteGroupingsDurations, scaleMap) {
    var noteEvents = [];
    var currentPitch = 3;

    for (var i = 0; i < totalNoteGroupingsDurations; i++) {
        // pick a random note grouping and duration and generate that many notes
        var numberOfNotesToGenerate = commonNoteGroupings[Math.floor(Math.random() * commonNoteGroupings.length)];

        debug_print("CommonNoteGroupingsLength :: " + commonNoteGroupings.length);

        var duration = commonNoteDurations[Math.floor(Math.random() * commonNoteDurations.length)];

        debug_print("CommonNoteDurationsLength :: " + commonNoteDurations.length);
        debug_print("numberOfNotesToGenerate :: " + numberOfNotesToGenerate);

        var pitches = []; 2

        for (var j = 0; j < numberOfNotesToGenerate; j++) {

            var distribution = createNoteDistribution(numberOfNotesToGenerate, currentPitch);

            var randomIndex = Math.floor(Math.random() * 100);
            var nextPitch = distribution[randomIndex];
            pitches.push(nextPitch);

            // currentPitch needs to select from internvalpitchmap 
            // currentPitch = nextPitch;
            debug_print("Scale Map Length :: " + (scaleMap.size - 1));

            currentPitch = getRandomInt(0, (scaleMap.size - 1));
        }

        var pitchesAsNotes = [];
        pitches.forEach(pitch => {

            pitchesAsNotes.push(scaleMap.get(pitch));

            debug_print("Interval Pitch Map:: Pitch[" + pitch + "] :: scaleMap[" + scaleMap.get(pitch) + "]");

        });
        noteEvents.push(new MidiWriter.NoteEvent({ pitch: pitchesAsNotes, duration: duration.toString() }));
    }
    debug_print('note events');
    debug_print(noteEvents);
    return noteEvents;
}

function addNotesToTrack(track, noteEvents) {
    debug_print('Add Notes to track');
    track.addEvent(noteEvents, function (event, index) {
        return { sequential: true };
    });
    debug_print(track);
    return track;
}

function getMidiString(write) {
    debug_print(write.base64());
    return write.base64()
}

function writeMIDIfile(write) {
    filename = Date.now()
    const buffer = new Buffer.from(write.buildFile());
    debug_print(write.buildFile());
    debug_print(buffer);
    fs.writeFile(filename + '.mid', buffer, function (err) {
        if (err) {
            console.log(err)
            debug_print(err)
            throw err;
        }
    });
    debug_print('MIDI file created')
}

function debug_print(string) {
    if (DEBUG == true) {
        console.log(string);
    }
    return;
}

function roundTwoDecimalPoints(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

module.exports = {
    musicGenerationDriver: musicGenerationDriver,
    setInstrument: setInstrument,
    getScaleNotes: getScaleNotes,
    getScaleMap: getScaleMap,
    getOctaveRangeArray: getOctaveRangeArray,
    createNotes: createNotes,
    addNotesToTrack: addNotesToTrack,
    getMidiString: getMidiString,
    writeMIDIfile: writeMIDIfile,
    getNoteDurationsPerBeatPerSecond: getNoteDurationsPerBeatPerSecond,
    roundTwoDecimalPoints: roundTwoDecimalPoints,
    buildMarkovModel: buildMarkovModel, 
}

