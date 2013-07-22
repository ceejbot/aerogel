#!/usr/bin/env node

var optimist = require('optimist')
		.usage('Set a Crazyflie parameter.\nUsage: $0 <param> <value>')
		.alias('h', 'help')
		.describe('h', 'show this help message')
		;

var variables;
var param = optimist.argv._[0];
var value = optimist.argv._[1];

if (!param || !value || optimist.argv.h)
{
	optimist.showHelp();
	process.exit(0);
}

var Aerogel = require('../index');

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

setTimeout(bail, 30000);

driver.findCopters()
.then(function(copters)
{
	if (copters.length === 0)
	{
		console.error('No copters found! Is your copter turned on?');
		process.exit(1);
	}

	console.log(driver.version());

	var uri = copters[0];
	console.log('Using copter at', uri);
	return uri;
})
.then(function(uri)
{
	return copter.connect(uri);
})
.then(function()
{
	console.log('got all telemetry & parameters');

	variables = copter.driver.parameters.all();
	if (!variables[param])
	{
		console.log('parameter does not exist:', param);
		console.log(Object.keys(variables));
		return bail();
	}

	return copter.driver.parameters.get(param);
})
.then(function(value)
{
	console.log('current value:', value);
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
