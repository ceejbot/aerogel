#!/usr/bin/env node

var optimist = require('optimist')
		.usage('Make a crazyflie hover.\nUsage: $0 [-c <channel>]')
		.alias('c', 'channel')
		.describe('c', 'if more than one copter is found, prefer the one on this channel')
		.alias('h', 'help')
		.describe('h', 'show this help message')
		;

var channel = optimist.argv.c;

var
	_       = require('lodash'),
	Aerogel = require('../index'),
	Leap    = require('leapjs'),
	P       = require('p-promise')
	;

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

function bail()
{
	copter.land()
	then(function()
	{
		return copter.shutdown();
	})
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown();
		return process.exit(1);
	})
	.done();
}

function leaploop(frame)
{
	var hands = frame.hands;
	var pointables = frame.pointables;
	var gestures = frame.gestures;

	if (frame.gestures.length > 0)
	{
		var g = frame.gestures[0];
		// console.log(g.type);
		if (g.type === 'swipe')
			handleSwipe(g);
		else if (g.type === 'circle')
			handleCircle(g, frame);
	}
}

var controller = new Leap.Controller(
{
	enableGestures: true,
});

controller.on('ready', function()
{
	console.log('leap controller ready');
});

controller.on('connect', function()
{
	console.log('leap controller connected');
});

controller.on('disconnect', function()
{
	console.log('leap controller disconnected');
});

controller.on('frame', leaploop);

var lastCircle = 0;
function handleCircle(circle, frame)
{
	var state = copter.copterStates.currentState();
	var now = Date.now();
	if (now - lastCircle < 1000)
		return 'ignored';

	if (state !== 'waiting')
	{
		lastCircle = Date.now();
		return land();
	}
	else if (state === 'waiting')
	{
		lastCircle = Date.now();
		return takeoff();
	}
}

function handleSwipe(gesture)
{
	var scaledSpeed = Math.round(gesture.speed) * 10;
	var currentThrust = copter.thrust;

	if (!_.isNumber(currentThrust))
		currentThrust = 10001;

	if (copter.copterStates.currentState() !== 'hovering')
		return 'ignored';

	if (gesture.direction[1] < 0)
	{
		console.log('swipe down', scaledSpeed);
		copter.thrust = currentThrust - scaledSpeed;
	}
	else
	{
		console.log('swipe up', gesture.speed);
		copter.thrust = currentThrust + scaledSpeed;
	}

	return copter.thrust;
}

function takeoff()
{
	return copter.takeoff()
	.then(function()
	{
		setTimeout(land, 5000);
		return copter.hover();
	});
}

function land()
{
	copter.land()
	.then(function() { return copter.shutdown(); })
	.then(function(response)
	{
		console.log(response);
		process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown()
		.then(function(response)
		{
			console.log(response);
			process.exit(1);
		});
	})
	.done();
}

driver.findCopters()
.then(function(copters)
{
	if (copters.length === 0)
	{
		console.error('No copters found! Is your copter turned on?');
		process.exit(1);
	}

	if (copters.length === 1)
		return copters[0];

	if (optimist.argv.hasOwnProperty('c'))
	{
		var patt = new RegExp('\/' + channel + '\/');
		for (var i = 0; i < copters.length; i++)
		{
			if (patt.test(copters[i]))
				return copters[i];
		}
	}

	return copters[0];
})
.then(function(uri)
{
	console.log('Using copter at', uri);
	return copter.connect(uri);
})
.then(function()
{
	console.log('connecting the leapmotion controller');
	controller.connect();
})
.fail(function(err)
{
	console.log(err);
	bail();
})
.done();

