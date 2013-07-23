var optimist = require('optimist')
		.usage('Get telemetry from a Crazyflie.\nUsage: $0 [-c <channel>]')
		.alias('c', 'channel')
		.describe('c', 'if more than one copter is found, prefer the one on this channel')
		.alias('h', 'help')
		.describe('h', 'show this help message')
		;

var channel = optimist.argv.c;


var Aerogel = require('../index');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
var params;
process.on('SIGINT', bail);

console.log('just connecting & sitting to log some telemetry info...');

function bail()
{
	console.log('entered bail()');
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

setTimeout(bail, 30000);

driver.findCopters(channel)
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
	console.log('got all telemetry & parameters');

	params = copter.driver.parameters.all();
	console.log(params);
	return copter.driver.parameters.get('pid_attitude.yaw_kd');
})
.then(function(value)
{
	console.log('pid_attitude.yaw_kd:', value);
	return copter.shutdown();
})
.then(function(response)
{
	console.log('Shutdown complete.');
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
