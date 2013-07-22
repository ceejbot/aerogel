var
	_            = require('lodash'),
	assert       = require('assert'),
	events       = require('events'),
	util         = require('util'),
	P            = require('p-promise'),
	stateMachine = require('state-machine'),
	CrazyDriver  = require('./crazydriver')
	;

var MAX_THRUST = 60000;
var MIN_THRUST = 10001;
var ε = 0.01; // the slop to tolerate in goals vs current state

var Copter = module.exports = function Copter(driver)
{
	events.EventEmitter.call(this);

	this.buildStates();

	this.xmode           = false;
	this.driver          = driver || new CrazyDriver();
	this.currentSetpoint = {};
	this.telemetry       = {};
	this.goal            =
	{
		roll:   0,
		pitch:  0,
		yaw:    0,
		thrust: 0,
		x:      0,
		y:      0,
		z:      0
	};
	this.nextSetpoint =
	{
		roll:   0,
		pitch:  0,
		yaw:    0,
		thrust: 0
	};
};
util.inherits(Copter, events.EventEmitter);

//------------------------------
// This is the public API.

Copter.prototype.connect = function(uri)
{
	var self = this;
	self.copterStates.connect();

	return self.driver.connect(uri)
	.then(function()
	{
		self.driver.telemetry.subscribe('motor', self.handleMotorTelemetry.bind(self));
		self.driver.telemetry.subscribe('stabilizer', self.handleStabilizerTelemetry.bind(self));
		self.driver.telemetry.subscribe('accelerometer', self.handleAccTelemetry.bind(self));
		self.copterStates.ready();
	});
};

Copter.prototype.takeoff = function()
{
	// take off & hover.
	var self = this,
		deferred = P.defer();

	console.log('takeoff()');

	this.copterStates.takeoff();
	// this.pulseTimer = setInterval(this.pulse.bind(this), 100);

	var maxThrust   = 39601;
	var minThrust   = 37700;
	var thrust      = minThrust;
	var thrustStep  = 500;
	var stepMS      = 250;
	var timeAtMax   = 4;
	var timeAtMin   = 2;
	var timeCounter = 0;

	function thrustup()
	{
		if (thrust === 0)
			return;
		if (timeCounter === 0)
		{
			thrust += thrustStep;
			if (thrust >= maxThrust)
			{
				thrust = maxThrust;
				timeCounter = 1;
			}
		}
		else if (timeCounter >= timeAtMax)
		{
			thrust -= thrustStep;
			if (thrust < minThrust)
			{
				if (timeCounter >= timeAtMax + timeAtMin)
				{
					deferred.resolve('OK');
					thrust = 0;
					return;
				}
				else
				{
					timeCounter += 1;
					thrust = minThrust;
				}
			}
		}
		else
			timeCounter += 1;
		// console.log('current timeCounter', timeCounter, '; thrust', thrust);
		self.thrust = thrust;
		self.goal.thrust = thrust;
	}

	this.flightTimer = setInterval(thrustup, stepMS);
	return deferred.promise;
};

Copter.prototype.land = function()
{
	var self = this,
		deferred = P.defer();

	this.copterStates.land();

	var thrustStep = 1000;
	var stepMS = 250;

	if (this.flightTimer)
		clearInterval(this.flightTimer);

	function landCurve()
	{
		var thrust = self.thrust - thrustStep;
		if (thrust <= MIN_THRUST)
			thrust = MIN_THRUST;

		// console.log('landing; thrust:', thrust);
		self.goal.thrust = thrust;
		self.thrust = thrust;

		if (thrust === MIN_THRUST)
		{
			self.copterStates.landed();
			deferred.resolve(self.copterStates.currentState());
		}
	}

	this.hoverTimer = setInterval(landCurve, stepMS);

	return deferred.promise;
};

Copter.prototype.hover = function()
{
	this.copterStates.stabilize();
};


// state machine ceremony

Copter.prototype.buildStates = function()
{
	var self = this;

	this.copterStates = stateMachine();
	this.copterStates
		.build()
		.state('setup',
		{
			initial: true,
			enter: this.enterSetup.bind(this),
		})
		.state('connected',
		{
			initial: false,
		})
		.state('waiting',
		{
			initial: false,
			enter: this.enterWaiting.bind(this),
			// leave: function() { },
		})
		.state('taking-off',
		{
			initial: false,
			enter: this.enterTakeoff.bind(this),
		})
		.state('hovering',
		{
			initial: false,
			enter: this.enterHovering.bind(this),
		})
		.state('moving',
		{
			initial: false,
			enter: this.enterMoving.bind(this),
		})
		.state('landing',
		{
			initial: false,
			enter: this.enterLanding.bind(this),
			leave: this.leaveLanding.bind(this),
		})
		.event('connect',   'setup',      'connected')
		.event('ready',     'connected',  'waiting')
		.event('takeoff',   'waiting',    'taking-off')
		.event('stabilize', 'taking-off', 'hovering')
		.event('move',      'hovering',   'moving')
		.event('settle',    'moving',     'hovering')
		.event('land',      'hovering',   'landing')
		.event('landed',    'landing',    'waiting')
		;

	this.copterStates.onChange = function(current, previous)
	{
		console.log('STATE:', previous, '-->', current);
	};
};

Copter.prototype.enterSetup = function()
{

};

Copter.prototype.enterWaiting = function()
{
	// TODO
};

Copter.prototype.enterTakeoff = function()
{
	this.pulseTimer = setInterval(this.pulse.bind(this), 100);
	this.goal.z = 0.5;
};

Copter.prototype.enterHovering = function()
{
	this.goal.z = 0;
};

Copter.prototype.enterMoving = function()
{
	// TODO
};

Copter.prototype.enterLanding = function()
{

};

Copter.prototype.leaveLanding = function()
{
	clearInterval(this.hoverTimer);
	clearInterval(this.pulseTimer);
	this.setpoint(0, 0, 0, 0);
};

// ------------------------------
// Lower-level control functions.

Copter.prototype.pulse = function()
{
	return this.setpoint(
		this.nextSetpoint.roll,
		this.nextSetpoint.pitch,
		this.nextSetpoint.yaw,
		this.nextSetpoint.thrust
	);
};

Copter.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	if (this.xmode)
	{
		roll  = 0.707 * (roll - pitch);
		pitch = 0.707 * (roll + pitch);
	}

	this.currentSetpoint =
	{
		roll:   roll,
		pitch:  pitch,
		yaw:    yaw,
		thrust: thrust
	};

	return this.driver.setpoint(roll, pitch, yaw, thrust);
};

function deltaToGoal(current, goal)
{
	var diff = current - goal;
	if (Math.abs(diff) > ε)
		return diff;
	return 0;
}

Copter.prototype.handleStabilizerTelemetry = function(data)
{
	this.telemetry.stabilizer = data;

	var thrustDelta = deltaToGoal(data.thrust, this.goal.thrust);
	var rollDelta   = deltaToGoal(data.roll, this.goal.roll);
	var pitchDelta  = deltaToGoal(data.pitch, this.goal.pitch);
	var yawDelta    = deltaToGoal(data.yaw, this.goal.yaw);

	switch (this.copterStates.currentState())
	{
	case 'taking-off':
	case 'moving':
	case 'hovering':
		// this.roll   = this.roll + rollDelta;
		// this.pitch  = this.pitch + pitchDelta;
		// this.yaw    = this.goal.yaw + yawDelta;
		// this.thrust = this.goal.thrust;
		break;

	default:
		// console.log('stabilizer:', data);
		break;
	}
};

Copter.prototype.handleMotorTelemetry = function(data)
{
	// console.log('motor:', data);
	this.telemetry.motor = data;

	switch (this.copterStates.currentState())
	{
	case 'taking-off':
		var thrustDelta = deltaToGoal(data.thrust, this.goal.thrust);
		this.goal.thrust += thrustDelta;
		this.thrust  = this.goal.thrust;
		// console.log('thrust delta:', thrustDelta);
		break;

	default:
		// console.log('stabilizer:', data);
		break;
	}
};

Copter.prototype.handleAccTelemetry = function(data)
{
	// console.log('acc:', data);
	this.telemetry.acc = data;
};

Copter.prototype.shutdown = function()
{
	return this.driver.close();
};

// property boilerplate

Copter.prototype.setPitch = function(p)
{
	this.nextSetpoint.pitch = p;
};
Copter.prototype.getPitch = function() { return this.currentSetpoint.pitch; };
Copter.prototype.__defineGetter__('pitch', Copter.prototype.getPitch);
Copter.prototype.__defineSetter__('pitch', Copter.prototype.setPitch);

Copter.prototype.setYaw = function(y)
{
	this.nextSetpoint.yaw = y;
};
Copter.prototype.getYaw = function() { return this.currentSetpoint.yaw; };
Copter.prototype.__defineGetter__('yaw', Copter.prototype.getYaw);
Copter.prototype.__defineSetter__('yaw', Copter.prototype.setYaw);

Copter.prototype.setThrust = function(t)
{
	if (!_.isNumber(t))
		t = 10001;
	else if (t < 10001)
		t = 10001;
	else if (t > 60000)
		t = 60000;

	this.nextSetpoint.thrust = Math.round(t);
};
Copter.prototype.getThrust = function() { return this.currentSetpoint.thrust; };
Copter.prototype.__defineGetter__('thrust', Copter.prototype.getThrust);
Copter.prototype.__defineSetter__('thrust', Copter.prototype.setThrust);

