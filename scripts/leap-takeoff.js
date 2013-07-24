var optimist = require('optimist')
		.usage('Make a crazyflie hover.\nUsage: $0 [-c <channel>]')
		.alias('c', 'channel')
		.describe('c', 'if more than one copter is found, prefer the one on this channel')
		.alias('h', 'help')
		.describe('h', 'show this help message')
		;

var channel = optimist.argv.c;

var Aerogel = require('../index');
var P = require('p-promise');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

function bail()
{
	return copter.shutdown()
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown();
		return process.exit(0);
	})
	.done();
}

var leap = new Leap.Controller(
{
	host: '127.0.0.1',
	port: 6437,
	enableGestures: true,
	frameEventName: 'frame'
});
leap.on('frame', leaploop);

/*
{ startPosition: [ 134.616, 391.857, 40.0765 ],
    position: [ 34.8631, 82.5179, 74.9414 ],
    direction: [ -0.167425, -0.98032, 0.104602 ],
    speed: 126.193,
    id: 45,
    handIds: [ 1 ],
    pointableIds: [ 6 ],
    duration: 192594,
    state: 'update',
    type: 'swipe' }
*/

function leaploop(frame)
{
	if (frame.gestures.length > 0)
	{
		var g = frame.gestures[0];
		if (g.type === 'swipe')
			handleSwipe(g);
		else if (g.type === 'circle')
			handleCircle(g, frame);
	}
}

var lastCircle = 0;
function handleCircle(circle, frame)
{
	var state = copter.copterStates.currentState();
	var now = Date.now();
	if (now - lastCircle < 1000)
		return P('ignored');

	if (state === 'flying')
	{
		lastCircle = Date.now();
		return copter.land();
	}
	else if (state === 'waiting')
	{
		lastCircle = Date.now();
		return copter.takeoff();
	}
}

function handleSwipe(gesture)
{
	var scaledSpeed = Math.round(gesture.speed) * 10;
	var currentThrust = copter.thrust;

	if (!_.isNumber(currentThrust))
		currentThrust = 10001;

	if (copter.copterStates.currentState() !== 'flying')
		return P('ignored');

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

	return P(copter.thrust);
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
	leap.connect();
})
.fail(function(err)
{
	console.log(err);
	bail();
})
.done();

