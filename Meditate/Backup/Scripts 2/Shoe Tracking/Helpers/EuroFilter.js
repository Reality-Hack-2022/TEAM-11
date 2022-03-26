/**
 * Author: Gery Casiez
 * Details: http://cristal.univ-lille.fr/~casiez/1euro/
 *
 * Copyright 2019 Inria
 *
 * BSD License https://opensource.org/licenses/BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *  1. Redistributions of source code must retain the above copyright notice, this list of conditions
 * and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions
 * and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or
 * promote products derived from this software without specific prior written permission.

 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

/**
 *
 * Modified 2022 Snap Inc.
 *
 */


var LowPassFilter = function(alpha, initval) {
    initval = initval || 0;
    this.y = this.s = initval;
    this.setAlpha(alpha);
    this.initialized = false;
};

LowPassFilter.prototype = {
    setAlpha(alpha) {
        if (alpha <= 0.0 || alpha > 1.0) {
            print("alpha should be in (0.0., 1.0]");
        }
        this.a = alpha;
    },

    filter(value) {
        var result;
        if (this.initialized) {
            result = this.a * value + (1.0 - this.a) * this.s;
        } else {
            result = value;
            this.initialized = true;
        }
        this.y = value;
        this.s = result;
        return result;
    },

    filterWithAlpha(value, alpha) {
        this.setAlpha(alpha);
        return this.filter(value);
    },

    hasLastRawValue() {
        return this.initialized;
    },

    lastRawValue() {
        return this.y;
    },

    reset() {
        this.initialized = false;
    }
};



var OneEuroFilter = function(freq, mincutoff, beta_, dcutoff) {
    mincutoff = mincutoff || 1;
    beta_ = beta_ || 0;
    dcutoff = dcutoff || 1;

    this.setFrequency(freq);
    this.setMinCutoff(mincutoff);
    this.setBeta(beta_);
    this.setDerivateCutoff(dcutoff);
    this.x = new LowPassFilter(this.alpha(mincutoff));
    this.dx = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
};


OneEuroFilter.prototype = {
    alpha(cutoff) {
        var te = 1.0 / this.freq;
        var tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau/te);
    },

    setFrequency(f) {
        if (f <= 0) {
            print("freq should be >0") ;
        }
        this.freq = f;
    },

    setMinCutoff(mc) {
        if (mc<=0) {
            print("mincutoff should be >0");
        }
        this.mincutoff = mc;
    },

    setBeta(b) {
        this.beta_ = b;
    },

    setDerivateCutoff(dc) {
        if (dc <= 0) {
            print("dcutoff should be >0");
        }
        this.dcutoff = dc ;
    },

    reset() {
        this.x.reset();
        this.dx.reset();
        this.lasttime = undefined;
    },

    filter(value, timestamp) {
        // update the sampling frequency based on timestamps
        if (this.lasttime !== undefined && timestamp !== undefined) {
            this.freq = 1.0 / (timestamp - this.lasttime);
        }
        this.lasttime = timestamp;
        // estimate the current variation per second
        var dvalue = this.x.hasLastRawValue() ? (value - this.x.lastRawValue())*this.freq : 0.0;
        var edvalue = this.dx.filterWithAlpha(dvalue, this.alpha(this.dcutoff));
        // use it to update the cutoff frequency
        var cutoff = this.mincutoff + this.beta_ * Math.abs(edvalue);
        // filter the given value
        return this.x.filterWithAlpha(value, this.alpha(cutoff));
    }
};

var OneEuroFilterXY = function(freq, mincutoff, beta_, dcutoff) {
    mincutoff = mincutoff || 1;
    beta_ = beta_ || 0;
    dcutoff = dcutoff || 1;

    this.setFrequency(freq);
    this.setMinCutoff(mincutoff);
    this.setBeta(beta_);
    this.setDerivateCutoff(dcutoff);
    this.x = new LowPassFilter(this.alpha(mincutoff));
    this.dx = new LowPassFilter(this.alpha(dcutoff));
    this.y = new LowPassFilter(this.alpha(mincutoff));
    this.dy = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
};


OneEuroFilterXY.prototype = {
    alpha(cutoff) {
        var te = 1.0 / this.freq;
        var tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau/te);
    },

    setFrequency(f) {
        if (f<=0) {
            print("freq should be >0");
        }
        this.freq = f;
    },

    setMinCutoff(mc) {
        if (mc<=0) {
            print("mincutoff should be >0");
        }
        this.mincutoff = mc;
    },

    setBeta(b) {
        this.beta_ = b;
    },

    setDerivateCutoff(dc) {
        if (dc<=0) {
            print("dcutoff should be >0");
        }
        this.dcutoff = dc;
    },

    reset() {
        this.x.reset();
        this.dx.reset();
        this.y.reset();
        this.dy.reset();
        this.lasttime = undefined;
    },

    filter(value_x, value_y, timestamp) {
        // update the sampling frequency based on timestamps
        if (this.lasttime !== undefined && timestamp !== undefined) {
            this.freq = 1.0 / (timestamp - this.lasttime);
        }
        this.lasttime = timestamp;
        // estimate the current variation per second
        var dvalue_x = this.x.hasLastRawValue() ? (value_x - this.x.lastRawValue())*this.freq : 0.0;
        var dvalue_y = this.y.hasLastRawValue() ? (value_y - this.y.lastRawValue())*this.freq : 0.0;

        var edvalue_x = this.dx.filterWithAlpha(dvalue_x, this.alpha(this.dcutoff));
        var edvalue_y = this.dy.filterWithAlpha(dvalue_y, this.alpha(this.dcutoff));

        var edvalue_xy_norm = Math.sqrt(Math.pow(edvalue_x, 2) + Math.pow(edvalue_y, 2));

        // use it to update the cutoff frequency
        var cutoff = this.mincutoff + this.beta_ * Math.abs(edvalue_xy_norm);
        // filter the given value
        var x_out = this.x.filterWithAlpha(value_x, this.alpha(cutoff));
        var y_out = this.y.filterWithAlpha(value_y, this.alpha(cutoff));
        return [x_out, y_out];
    }
};


var OneEuroFilterQuat = function(freq, mincutoff, beta_, dcutoff) {
    mincutoff = mincutoff || 1;
    beta_ = beta_ || 0;
    dcutoff = dcutoff || 1;

    this.setFrequency(freq);
    this.setMinCutoff(mincutoff);
    this.setBeta(beta_);
    this.setDerivateCutoff(dcutoff);

    this.lasttime = undefined;
    this.q_prev_rot = undefined;
    this.q_prev_speed = undefined;
};


OneEuroFilterQuat.prototype = {
    alpha(cutoff) {
        var te = 1.0 / this.freq;
        var tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau/te);
    },

    setFrequency(f) {
        if (f<=0) {
            print("freq should be >0");
        }
        this.freq = f;
    },

    setMinCutoff(mc) {
        if (mc<=0) {
            print("mincutoff should be >0");
        }
        this.mincutoff = mc;
    },

    setBeta(b) {
        this.beta_ = b;
    },

    setDerivateCutoff(dc) {
        if (dc<=0) {
            print("dcutoff should be >0");
        }
        this.dcutoff = dc;
    },

    filter(q_new_rot, timestamp) {
        // update the sampling frequency based on timestamps
        if (this.lasttime !== undefined && timestamp!== undefined) {
            this.freq = 1.0 / (timestamp - this.lasttime);
        }
        this.lasttime = timestamp;

        if (this.q_prev_rot === undefined) {
            this.q_prev_rot = q_new_rot;
        }

        var inv_q_prev_rot = this.q_prev_rot.invert();
        /**
         * R_new = dR * R_old  => dR = R_new * R_old^{-1}
         */
        var interm = q_new_rot.multiply(inv_q_prev_rot);
        interm.normalize();
        var aa_axis = interm.getAxis();
        var aa_angle = interm.getAngle();

        aa_angle = aa_angle * this.freq;
        var q_new_speed = quat.angleAxis(aa_angle, aa_axis);

        if (this.q_prev_speed === undefined) {
            this.q_prev_speed = q_new_speed;
        }

        var speed_alpha = this.alpha(this.dcutoff);
        var new_speed = quat.slerp(this.q_prev_speed, q_new_speed, speed_alpha);
        var speed_aa_angle = new_speed.getAngle();
        var cutoff = this.mincutoff + this.beta_ * speed_aa_angle;
        var new_rotation = quat.slerp(this.q_prev_rot, q_new_rot, this.alpha(cutoff));

        this.q_prev_rot = new_rotation;
        this.q_prev_speed = new_speed;

        return [new_rotation, new_speed];
    }
};

global.OneEuroFilter = OneEuroFilter;
global.OneEuroFilterXY = OneEuroFilterXY;
global.OneEuroFilterQuat = OneEuroFilterQuat;