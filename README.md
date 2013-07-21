aerogel
=======

A node.js control library for the [Crazyflie](http://wiki.bitcraze.se/projects:crazyflie:userguide:index) nano-copter. This is a work in progress! Your contributions are more than welcome.

[![Dependencies](https://david-dm.org/ceejbot/aerogel.png)](https://david-dm.org/ceejbot/aerogel) [![NPM version](https://badge.fury.io/js/aerogel.png)](http://badge.fury.io/js/aerogel)

[![NPM](https://nodei.co/npm/aerogel.png)](http://nodei.co/npm/aerogel/)

## Installation

[libusb](http://sourceforge.net/projects/libusb/) is required for the radio driver. On OS X, install with [homebrew](http://mxcl.github.io/homebrew/):

`brew install libusb`

Then install Aerogel:

`npm install aerogel`

Aerogel uses new-style node streams so it requires node 0.10.x or later.

## Basics

The `copter` object is what your control scripts should manipulate.

A simple script for taking off then landing again immediately looks like this:

```javascript
var Aerogel = require('../index');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', copter.land.bind(copter));

driver.findCopters()
.then(function(copters)
{
    if (copters.length === 0)
    {
        console.error('No copters found! Is your copter turned on?');
        process.exit(1);
    }

    var uri = copters[0];
    console.log('Using copter at', uri);
    return uri;
})
.then(function(uri) { return copter.connect(uri); })
.then(function() { return copter.takeoff(); })
.then(function() { return copter.land(); })
.then(function() { return copter.shutdown(); })
.done();
```

Look at the [examples](examples/) directory for more.

## Telemetry

The protocol driver emits telemetry information as events that the copter object listens for. The handlers for these events don't do anything yet, but the plan is that they'll eventually be used to implement higher-level flight control constructs & autonomous goal-seeking.

`copter.handleStabilizerTelemetry()` gets an object with three orientation fields: `roll`, `pitch`, `yaw`.

`copter.handleMotorTelemetry()` gets an object with the state of the four motors: `m1`, `m2`, `m3`, and `m4`.

`copter.handleAccTelemetry()` gets an object with the state of the accelerometer: `x`, `y`, and `z`. The accelerometer data is available only for 10DOF copters with tip-of-tree firmware.

## API

TODO

Aerogel exposes a promises API at the moment. Eventually I plan to offer a standard callback API as well. If you do not pass a callback to a method, a promise is returned. 

## LeapMotion

If you're lucky enough to have a LeapMotion, there's a rough example of controlling the copter with circle gestures & vertical swipes in `examples/leap1.js`.

## To-do

Everything. See the Github issues for my plan about where I'd like this project to go. The Crazyflie is difficult to control with a gamepad, and my theory is that software can eventually fly it better than I can. Also, I dream of a cloud of Crazyflies orbiting my head, all under control of a little Beaglebone or Raspberry PI hidden inside my hat. Maybe you have a dream for your copter!

## Contributing

Allman bracing, tabs to indent, camel case. Write tests in Mocha. [mocha-as-promised](https://github.com/domenic/mocha-as-promised) and [chai-as-promised](https://github.com/domenic/chai-as-promised/) are available. Do cool things.

## License

MIT.
