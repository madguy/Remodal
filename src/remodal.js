/*!
 *  Remodal - v1.0.6
 *  Responsive, lightweight, fast, synchronized with CSS animations, fully customizable modal window plugin with declarative configuration and hash tracking.
 *  http://vodkabears.github.io/remodal/
 *
 *  Made by Ilya Makarov
 *  Under MIT License
 */

const $ = require('jquery');

/**
 * Name of the plugin
 * @private
 * @const
 * @type {String}
 */
const PLUGIN_NAME = 'remodal';

/**
 * Namespace for CSS and events
 * @private
 * @const
 * @type {String}
 */
const NAMESPACE = global.REMODAL_GLOBALS && global.REMODAL_GLOBALS.NAMESPACE || PLUGIN_NAME;

/**
 * Animationstart event with vendor prefixes
 * @private
 * @const
 * @type {String}
 */
const ANIMATIONSTART_EVENTS = ['animationstart', 'webkitAnimationStart', 'MSAnimationStart', 'oAnimationStart'].map((eventName) => {
	return `${eventName}.${NAMESPACE}`;
}).join(' ');

/**
 * Animationend event with vendor prefixes
 * @private
 * @const
 * @type {String}
 */
const ANIMATIONEND_EVENTS = ['animationend', 'webkitAnimationEnd', 'MSAnimationEnd', 'oAnimationEnd'].map((eventName) => {
	return `${eventName}.${NAMESPACE}`;
}).join(' ');

/**
 * Element names
 * @private
 * @const
 * @type {Array}
 */
const ELEMENT_NAMES = ['$bg', '$overlay', '$wrapper', '$modal'];

/**
 * Default settings
 * @private
 * @const
 * @type {Object}
 */
const DEFAULTS = $.extend({
	closeOnConfirm: true,
	closeOnCancel: true,
	closeOnEscape: true,
	closeOnOutsideClick: true,
	modifier: ''
}, global.REMODAL_GLOBALS && global.REMODAL_GLOBALS.DEFAULTS);

/**
 * States of the Remodal
 * @private
 * @const
 * @enum {String}
 */
const STATES = {
	CLOSING: 'closing',
	CLOSED: 'closed',
	OPENING: 'opening',
	OPENED: 'opened'
};

/**
 * Reasons of the state change.
 * @private
 * @const
 * @enum {String}
 */
const STATE_CHANGE_REASONS = {
	CONFIRMATION: 'confirmation',
	CANCELLATION: 'cancellation'
};

/**
 * Is animation supported?
 * @private
 * @const
 * @type {Boolean}
 */
const IS_ANIMATION = (() => {
	let style = document.createElement('div').style;

	return style.animationName !== undefined ||
		style.WebkitAnimationName !== undefined ||
		style.MozAnimationName !== undefined ||
		style.msAnimationName !== undefined ||
		style.OAnimationName !== undefined;
})();

/**
 * Is iOS?
 * @private
 * @const
 * @type {Boolean}
 */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.platform);

/**
 * All modal
 * @private
 * @type {Array}
 */
let _lookup = [];

/**
 * Current modal
 * @private
 * @type {Remodal}
 */
let _current;

/**
 * Returns an animation duration
 * @private
 * @param {jQuery} $elem
 * @returns {Number}
 */
function getAnimationDuration($elem) {
	let prefixes = ['', '-webkit-', '-moz-', '-o-', '-ms-'];

	let hasAnimationName = prefixes.some((prefix) => {
		return $elem.css(`${prefix}animation-name`) !== 'none';
	});

	if (IS_ANIMATION && hasAnimationName === false) {
		return 0;
	}

	let duration = prefixes.map((prefix) => {
		return $elem.css(`${prefix}animation-duration`);
	}).filter((duration) => {
		return duration != null;
	})[0] || '0s';

	let delay = prefixes.map((prefix) => {
		return $elem.css(`${prefix}animation-delay`);
	}).filter((duration) => {
		return duration != null;
	})[0] || '0s';

	let iterationCount = prefixes.map((prefix) => {
		return $elem.css(`${prefix}animation-iteration-count`);
	}).filter((duration) => {
		return duration != null;
	})[0] || '1';

	let len;
	let num;

	let durations = duration.split(', ');
	let delays = delay.split(', ');
	let iterationCounts = iterationCount.split(', ');

	// The 'duration' size is the same as the 'delay' size
	let max = durations.map((e, i) => {
		return {
			duration: durations[i],
			delay: delays[i],
			iterationCount: iterationCounts[i]
		};
	}).reduce((max, item) => {
		let num = parseFloat(item.duration) * parseInt(item.iterationCount, 10) + parseFloat(item.delay);
		return Math.max(max, num);
	}, 0);

	return max;
}

/**
 * Returns a scrollbar width
 * @private
 * @returns {Number}
 */
function getScrollbarWidth() {
	if ($(document.body).height() <= $(window).height()) {
		return 0;
	}

	let outer = document.createElement('div');
	let inner = document.createElement('div');
	let widthNoScroll;
	let widthWithScroll;

	outer.style.visibility = 'hidden';
	outer.style.width = '100px';
	document.body.appendChild(outer);

	widthNoScroll = outer.offsetWidth;

	// Force scrollbars
	outer.style.overflow = 'scroll';

	// Add inner div
	inner.style.width = '100%';
	outer.appendChild(inner);

	widthWithScroll = inner.offsetWidth;

	// Remove divs
	outer.parentNode.removeChild(outer);

	return widthNoScroll - widthWithScroll;
}

/**
 * Locks the screen
 * @private
 */
function lockScreen() {
	if (IS_IOS) {
		return;
	}

	let $html = $('html');
	let lockedClass = namespacify('is-locked');
	let paddingRight;
	let $body;

	if (!$html.hasClass(lockedClass)) {
		$body = $(document.body);

		// Zepto does not support '-=', '+=' in the `css` method
		paddingRight = parseInt($body.css('padding-right'), 10) + getScrollbarWidth();

		$body.css('padding-right', `${paddingRight}px`);
		$html.addClass(lockedClass);
	}
}

/**
 * Unlocks the screen
 * @private
 */
function unlockScreen() {
	if (IS_IOS) {
		return;
	}

	let $html = $('html');
	let lockedClass = namespacify('is-locked');
	let paddingRight;
	let $body;

	if ($html.hasClass(lockedClass)) {
		$body = $(document.body);

		// Zepto does not support '-=', '+=' in the `css` method
		paddingRight = parseInt($body.css('padding-right'), 10) - getScrollbarWidth();

		$body.css('padding-right', `${paddingRight}px`);
		$html.removeClass(lockedClass);
	}
}

/**
 * Sets a state for an instance
 * @private
 * @param {Remodal} instance
 * @param {STATES} state
 * @param {Boolean} isSilent If true, Remodal does not trigger events
 * @param {String} Reason of a state change.
 */
function setState(instance, state, isSilent, reason) {
	ELEMENT_NAMES.forEach((elementName) => {
		let $elem = instance[elementName];
		$elem
			.removeClass(namespacify('is', STATES.CLOSING))
			.removeClass(namespacify('is', STATES.OPENING))
			.removeClass(namespacify('is', STATES.CLOSED))
			.removeClass(namespacify('is', STATES.OPENED))
			.addClass(namespacify('is', state))
	});

	instance.state = state;

	if (isSilent === false) {
		instance.$modal.trigger({
			type: state,
			reason: reason
		}, [{ reason: reason }])
	}
}

/**
 * Synchronizes with the animation
 * @param {Function} doBeforeAnimation
 * @param {Function} doAfterAnimation
 * @param {Remodal} instance
 */
function syncWithAnimation(doBeforeAnimation, doAfterAnimation, instance) {
	let runningAnimationsCount = 0;

	let handleAnimationStart = (e) => {
		if (e.target !== e.currentTarget) {
			return;
		}

		runningAnimationsCount += 1;
	};

	let handleAnimationEnd = (e) => {
		if (e.target !== e.currentTarget) {
			return;
		}

		runningAnimationsCount -= 1;

		if (runningAnimationsCount === 0) {
			// Remove event listeners
			ELEMENT_NAMES.forEach((elemName) => {
				instance[elemName].off(`${ANIMATIONSTART_EVENTS} ${ANIMATIONEND_EVENTS}`);
			});

			doAfterAnimation();
		}
	};

	ELEMENT_NAMES.forEach((elemName) => {
		instance[elemName]
			.on(ANIMATIONSTART_EVENTS, handleAnimationStart)
			.on(ANIMATIONEND_EVENTS, handleAnimationEnd);
	});

	doBeforeAnimation();

	// If the animation is not supported by a browser or its duration is 0
	let isAnimationSupport = ELEMENT_NAMES.some((elementName) => {
		return getAnimationDuration(instance[elementName]) !== 0;
	});

	if (isAnimationSupport) {
		return;
	}

	// Remove event listeners
	ELEMENT_NAMES.forEach((elemName) => {
		instance[elemName].off(`${ANIMATIONSTART_EVENTS} ${ANIMATIONEND_EVENTS}`);
	});

	doAfterAnimation();
}

/**
 * Closes immediately
 * @private
 * @param {Remodal} instance
 */
function halt(instance) {
	if (instance.state === STATES.CLOSED) {
		return;
	}

	ELEMENT_NAMES.forEach((elemName) => {
		instance[elemName].off(`${ANIMATIONSTART_EVENTS} ${ANIMATIONEND_EVENTS}`);
	});

	instance.$bg.removeClass(instance.settings.modifier);
	instance.$overlay.removeClass(instance.settings.modifier).hide();
	instance.$wrapper.hide();
	unlockScreen();
	setState(instance, STATES.CLOSED, true);
}

/**
 * Generates a string separated by dashes and prefixed with NAMESPACE
 * @private
 * @param {...String}
 * @returns {String}
 */
function namespacify() {
	let namespaces = Array.prototype.slice.call(arguments);
	return [NAMESPACE].concat(namespaces).join('-');
}

/**
 * Remodal constructor
 * @constructor
 * @param {jQuery} $modal
 * @param {Object} options
 */
function Remodal(html, options) {
	let $body = $(document.body);
	let remodal = this;

	remodal.settings = $.extend({}, DEFAULTS, options);
	remodal.index = _lookup.push(remodal) - 1;
	remodal.state = STATES.CLOSED;

	remodal.$overlay = $(`.${namespacify('overlay')}`);
	if (remodal.$overlay.length === 0) {
		remodal.$overlay = $('<div>')
			.addClass(namespacify('overlay'))
			.addClass(namespacify('is', STATES.CLOSED))
			.hide();
		$body.append(remodal.$overlay);
	}

	remodal.$bg = $(`.${namespacify('bg')}`)
		.addClass(namespacify('is', STATES.CLOSED));

	remodal.$modal = $(html)
		.addClass(NAMESPACE)
		.addClass(namespacify('is-initialized'))
		.addClass(remodal.settings.modifier)
		.addClass(namespacify('is', STATES.CLOSED))
		.attr('tabindex', '-1');

	remodal.$wrapper = $('<div>')
		.addClass(namespacify('wrapper'))
		.addClass(remodal.settings.modifier)
		.addClass(namespacify('is', STATES.CLOSED))
		.hide()
		.append(remodal.$modal);

	$body.append(remodal.$wrapper);

	// Add the event listener for the close button
	remodal.$wrapper.on(`click.${NAMESPACE}`, `[data-${PLUGIN_NAME}-action="close"]`, (e) => {
		e.preventDefault();

		remodal.close();
	});

	// Add the event listener for the cancel button
	remodal.$wrapper.on(`click.${NAMESPACE}`, `[data-${PLUGIN_NAME}-action="cancel"]`, (e) => {
		e.preventDefault();

		remodal.$modal.trigger(STATE_CHANGE_REASONS.CANCELLATION);

		if (remodal.settings.closeOnCancel) {
			remodal.close(STATE_CHANGE_REASONS.CANCELLATION);
		}
	});

	// Add the event listener for the confirm button
	remodal.$wrapper.on(`click.${NAMESPACE}`, `[data-${PLUGIN_NAME}-action="confirm"]`, (e) => {
		e.preventDefault();

		remodal.$modal.trigger(STATE_CHANGE_REASONS.CONFIRMATION);

		if (remodal.settings.closeOnConfirm) {
			remodal.close(STATE_CHANGE_REASONS.CONFIRMATION);
		}
	});

	// Add the event listener for the overlay
	remodal.$wrapper.on(`click.${NAMESPACE}`, (e) => {
		let $target = $(e.target);

		if ($target.hasClass(namespacify('wrapper')) === false) {
			return;
		}

		if (remodal.settings.closeOnOutsideClick) {
			remodal.close();
		}
	});
}

/**
 * Opens a modal window
 * @public
 */
Remodal.prototype.open = function () {
	let remodal = this;

	// Check if the animation was completed
	if (remodal.state === STATES.OPENING || remodal.state === STATES.CLOSING) {
		return;
	}

	if (_current && _current !== remodal) {
		halt(_current);
	}

	_current = remodal;
	lockScreen();
	remodal.$bg.addClass(remodal.settings.modifier);
	remodal.$overlay.addClass(remodal.settings.modifier).show();
	remodal.$wrapper.show().scrollTop(0);
	remodal.$modal.focus();

	let doBeforeAnimation = () => {
		setState(remodal, STATES.OPENING);
	};
	let doAfterAnimation = () => {
		setState(remodal, STATES.OPENED);
	};
	syncWithAnimation(doBeforeAnimation, doAfterAnimation, remodal);
};

/**
 * Closes a modal window
 * @public
 * @param {String} reason
 */
Remodal.prototype.close = function (reason) {
	let remodal = this;

	// Check if the animation was completed
	if (remodal.state === STATES.OPENING || remodal.state === STATES.CLOSING) {
		return;
	}

	let doBeforeAnimation = () => {
		setState(remodal, STATES.CLOSING, false, reason);
	};
	let doAfterAnimation = () => {
		remodal.$bg.removeClass(remodal.settings.modifier);
		remodal.$overlay.removeClass(remodal.settings.modifier).hide();
		remodal.$wrapper.hide();
		unlockScreen();
		setState(remodal, STATES.CLOSED, false, reason);
	};
	syncWithAnimation(doBeforeAnimation, doAfterAnimation, remodal);
};

/**
 * Returns a current state of a modal
 * @public
 * @returns {STATES}
 */
Remodal.prototype.getState = function () {
	return this.state;
};

/**
 * Destroys a modal
 * @public
 */
Remodal.prototype.destroy = function () {
	halt(this);
	this.$wrapper.remove();

	delete _lookup[this.index];
	let hasInstance = _lookup.some((instance) => instance != null);
	if (hasInstance === true) {
		return;
	}

	this.$overlay.remove();
	this.$bg
		.removeClass(namespacify('is', STATES.CLOSING))
		.removeClass(namespacify('is', STATES.OPENING))
		.removeClass(namespacify('is', STATES.CLOSED))
		.removeClass(namespacify('is', STATES.OPENED));
};

$(document).on(`keydown.${NAMESPACE}`, (e) => {
	if (e.keyCode !== 27) {
		return;
	}

	if (_current == null || _current.settings.closeOnEscape === false || _current.state !== STATES.OPENED) {
		return;
	}

	_current.close();
});

module.exports = Remodal;
