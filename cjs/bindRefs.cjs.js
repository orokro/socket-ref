/*
	bindRefs.js
	-----------

	Provides a simple function that takes two Vue refs and binds them together with 2-way sync, avoiding infinite loops.
*/
// Binds two Vue refs together with 2-way sync, avoiding infinite loops

// vue libs
const { ref, shallowRef, watch } = require('vue');

/**
 * Function to bind two Vue refs together with 2-way sync, avoiding infinite loops
 * 
 * @param {ref|shallowRef} refA - Vue ref (or shallowRef) to bind
 * @param {ref|shallowRef} refB - Vue ref (or shallowRef) to bind
 * @returns {function} - Function to stop the binding
 */
function bindRefs(refA, refB) {

	// guard flags
	let updatingA = false;
	let updatingB = false;

	// watch refA & update refB
	const stopA = watch(refA, (newVal) => {

		// if we're updating refA, don't update refB,
		// just reset the flag and return
		if (updatingA) {
			updatingA = false;
			return;
		}

		// set the flag and update refB
		updatingB = true;
		refB.value = newVal;
	});

	// watch refB & update refA
	const stopB = watch(refB, (newVal) => {

		// if we're updating refB, don't update refA,
		// just reset the flag and return
		if (updatingB) {
			updatingB = false;
			return;
		}

		// set the flag and update refA
		updatingA = true;
		refA.value = newVal;
	});

	// return the stop function for the watchers
	return () => {
		stopA();
		stopB();
	};
	
}

module.exports = { bindRefs };
