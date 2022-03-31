// FootDecoder.js
// Version: 1.0.0
// Event: On Awake
// Description: Performs decoding of the model output into readable trasform data


function logits(x) {
    return Math.log(x / (1.0 - x));
}

function clip(x, a, b) {
    return Math.max(a, Math.min(x, b));
}

global.FootDecoder = function(modelConfig) {
    this.cfg = modelConfig;

    //hysteresis:
    this.previousCenters = [];

    this.prevPointsTensor = new Float32Array(2);  // [n*2] just one point
    this.newPointsTensor = new Float32Array(2);   // [n*2]
    this.pointsShape = new vec3(2, 1, 1);               // [2, 1, 1]

    // EURO FILTERS
    this.euro_filter_list = [];  // Each item in the list should be of the form {id: 1, filter2d: EuroFilter2D, filter3d_xy, filter3d_z, filterRot}
};

global.FootDecoder.prototype = {
    decode_centers: function(center_heatmap, center_short_offset) {
        var min_logit = logits(this.cfg.minDetectionScore);
        // SORT IN ASCENDING ORDER THE HEATMAPS AND FILTER THE VALUES LOWER THAN MIN_LOGIT
        var indices = global.argsortThreshold(center_heatmap, true, min_logit);
        /// NMS SUPPRESSION. Array indices is the input and the output is stored in kept_indices:
        var kept_indices = Array(this.cfg.maximumNumFeet);
        var num_kept = 0;
        var idx_len = indices.length;
        while (idx_len > 0) {
            // Select element with the highest score
            idx_len--;
            var curIndex = indices[idx_len];

            var row = Math.floor(curIndex / this.cfg.heatmapWidth);
            var col = curIndex % this.cfg.heatmapWidth;
            var x_temp = col * this.cfg.inputWidth / (this.cfg.heatmapWidth - 1);        // col * 256/63
            var y_temp = row * this.cfg.inputHeight / (this.cfg.heatmapHeight - 1);      // row * 256/63
            var x_offset = center_short_offset[2 * curIndex];
            var y_offset = center_short_offset[2 * curIndex + 1];
            var curX = clip(x_temp + x_offset, 0, this.cfg.inputWidth - 1);
            var curY = clip(y_temp + y_offset, 0, this.cfg.inputHeight - 1);

            kept_indices[num_kept] = curIndex;
            num_kept++;
            if (num_kept >= this.cfg.maximumNumFeet) {
                break;
            }
            if (idx_len === 0) {
                break;
            }
            // Only keep the centers that are further than the nms_radius from the current active center
            // with the following approach we avoid re-assignign a new table at every iteration which might
            // make things faster
            var counter = 0;
            for (var j = 0; j < idx_len; j++) {
                var innerIndex = indices[j];

                var row2 = Math.floor(innerIndex / this.cfg.heatmapWidth);
                var col2 = innerIndex % this.cfg.heatmapWidth;
                var x_temp2 = col2 * this.cfg.inputWidth / (this.cfg.heatmapWidth - 1);        // col * 256/63
                var y_temp2 = row2 * this.cfg.inputHeight / (this.cfg.heatmapHeight - 1);      // row * 256/63
                var x_offset2 = center_short_offset[2 * innerIndex];
                var y_offset2 = center_short_offset[2 * innerIndex + 1];
                var innerX = clip(x_temp2 + x_offset2, 0, this.cfg.inputWidth - 1);
                var innerY = clip(y_temp2 + y_offset2, 0, this.cfg.inputHeight - 1);

                var xx = Math.pow((innerX - curX), 2);
                var yy = Math.pow((innerY - curY), 2);
                var dist = Math.sqrt(xx + yy);

                if (dist > this.cfg.nms_radius) {
                    indices[counter] = innerIndex;
                    counter++;
                }
            }
            idx_len = counter;
        }

        var centers = [];
        for (var k = 0; k < num_kept; k++) {
            var _curIndex = kept_indices[k];

            var row3 = Math.floor(_curIndex / this.cfg.heatmapWidth);
            var col3 = _curIndex % this.cfg.heatmapWidth;
            var x_temp3 = col3 * this.cfg.inputWidth / (this.cfg.heatmapWidth - 1);        // col * 256/63
            var y_temp3 = row3 * this.cfg.inputHeight / (this.cfg.heatmapHeight - 1);      // row * 256/63
            var x_offset3 = center_short_offset[2 * _curIndex];
            var y_offset3 = center_short_offset[2 * _curIndex + 1];
            var _curX = clip(x_temp3 + x_offset3, 0, this.cfg.inputWidth - 1);
            var _curY = clip(y_temp3 + y_offset3, 0, this.cfg.inputHeight - 1);

            var curScore = center_heatmap[_curIndex];
            centers.push({
                x: _curX,
                y: _curY,
                score: curScore
            });
        }
        return centers;
    },

    match_centers: function(new_centers, previousCenters) {
        // EMPTY new_centers AND COPY TO unmatched_new_centers
        var unmatched_new_centers = new_centers.splice(0, new_centers.length);

        if (previousCenters.length > 0) {
            // SORT BASED ON ID (FROM OLDEST TO NEWEST). OLDER IDS SHOULD HAVE PRIORITY IN MATCHING.
            // AGE should also decrease priority
            previousCenters.sort(function(a, b) {
                return a.id - b.id + 10 * (a.age - b.age);
            });

            //ADD MATCHING FLAG FOR PREVIOUS CENTERS
            for (var _p_c = 0; _p_c < previousCenters.length; _p_c++) {
                previousCenters[_p_c].matched = false;
            }
        }

        // ITERATE OLD DETECTIONS TO FIND MATCHES
        for (var p_c = 0; p_c < previousCenters.length; p_c++) {
            var prevX = previousCenters[p_c].x;
            var prevY = previousCenters[p_c].y;
            var previous_id = previousCenters[p_c].id;

            if (unmatched_new_centers.length > 0) {
                /**
                 * FIND THE NEW DETECTION CLOSEST TO THE OLD DETECTION CURRENTLY SELECTED
                 */
                var curX = unmatched_new_centers[0].x;
                var curY = unmatched_new_centers[0].y;
                var xx = Math.pow((prevX - curX), 2);
                var yy = Math.pow((prevY - curY), 2);
                var min_dist = Math.sqrt(xx + yy);
                var min_index = 0;

                for (var c = 1; c < unmatched_new_centers.length; c++) {
                    curX = unmatched_new_centers[c].x;
                    curY = unmatched_new_centers[c].y;
                    var _xx = Math.pow((prevX - curX), 2);
                    var _yy = Math.pow((prevY - curY), 2);
                    var dist = Math.sqrt(_xx + _yy);
                    if (dist < min_dist) {
                        min_index = c;
                        min_dist = dist;
                    }
                }

                if (min_dist < this.cfg.tracking_radius) {
                    previousCenters[p_c].matched = true;
                    unmatched_new_centers[min_index].id = previous_id;
                    unmatched_new_centers[min_index].age = 0;
                    unmatched_new_centers[min_index].matched = true;
                    unmatched_new_centers[min_index].track_duration = previousCenters[p_c].track_duration + 1;
                    new_centers.push(unmatched_new_centers[min_index]);
                    unmatched_new_centers.splice(min_index, 1);
                }
            }
        }

        /**
        *  ADD NEW TRACKS FOR UNMATCHED NEW DETECTIONS
        */
        for (var _c = 0; _c < unmatched_new_centers.length; _c++) {
            unmatched_new_centers[_c].id = this.cfg.next_id;
            unmatched_new_centers[_c].age = 0;
            unmatched_new_centers[_c].matched = false;
            unmatched_new_centers[_c].track_duration = 0;
            this.cfg.next_id++;
            new_centers.push(unmatched_new_centers[_c]);
        }

        /**
         *  INCREASE AGE OF OLD DETECTIONS AND DELETE THE ONES THAT ARE VERY OLD
         */
        for (var _p_c2 = 0; _p_c2 < previousCenters.length; _p_c2++) {
            if (!previousCenters[_p_c2].matched) {
                if (previousCenters[_p_c2].age < this.cfg.memory_cliff) {
                    previousCenters[_p_c2].age += 1;
                    previousCenters[_p_c2].track_duration += 1;
                    previousCenters[_p_c2].matched = false;
                    new_centers.push(previousCenters[_p_c2]);
                }
            }
        }
    },

    decode_foot_type: function(lr_class_logits, centers) {
        var dims = [this.cfg.heatmapHeight, this.cfg.heatmapWidth];
        for (var k = 0; k < centers.length; k++) {
            var curX = centers[k].x;
            var curY = centers[k].y;
            var lright_logit = global.sample_tensor2d_at_position(lr_class_logits, dims, curX, curY, this.cfg.stride);
            var lright_value = lright_logit > 0;
            centers[k].is_right = lright_value;
            centers[k].lr_score = lright_logit;
        }
    },

    hysteresis_center: function(centers) {
        for (var c = centers.length - 1; c >= 0; c--) {
            if (centers[c].track_duration == 0) { // ONLY FOR NEW DETECTIONS
                // DELETE NEW DETECTIONS IF THEY DON'T HAVE A SCORE HIGHER THAN THE HYSTERESIS UPPER BOUND
                if (centers[c].score < this.cfg.hysteresis_ub) {
                    centers.splice(c, 1);
                }
            }
        }
    },

    hysteresis_lr: function(centers, previousCenters) {
        if (previousCenters !== null) {
            for (var p_c = 0; p_c < previousCenters.length; p_c++) {
                var prev_center_id = previousCenters[p_c].id;
                var prev_foot_type_is_right = previousCenters[p_c].is_right;

                for (var c = 0; c < centers.length; c++) {
                    var center_id = centers[c].id;
                    if (prev_center_id === center_id) {
                        if (prev_foot_type_is_right) {  // IF PREVIOUS FOOT IS RIGHT
                            centers[c].is_right = centers[c].lr_score > -1;
                        } else { // IF PREVIOUS FOOT IS LEFT
                            centers[c].is_right = centers[c].lr_score > 1;
                        }
                    }
                }
            }
        }
    },



    new_center_decoder: function(modelOutput) {
        var center_heatmap = modelOutput.outputCenterClassTensor;
        var center_short_offset = modelOutput.outputCenterShortOffsetsTensor;
        var lr_class_logits = modelOutput.outputSparseLRClassTensor;

        /**
         * GET CENTERS FROM HEATMAP
         */
        var centers = this.decode_centers(center_heatmap, center_short_offset);

        /**
         * MATCH OLD AND NEW CENTERS
         */
        this.match_centers(centers, this.previousCenters); // TRACKING DECODER

        /**
         * SPECIFY L/R
         */
        this.decode_foot_type(lr_class_logits, centers);

        if (this.cfg.hysteresis_enabled) {
            this.hysteresis_center(center_heatmap);
            this.hysteresis_lr(centers, this.previousCenters);
        }

        // COPY OLD CENTERS
        this.previousCenters = centers.slice();

        return centers;
    },

    update_euro_filters_list: function(centers) {
        // FIRST DELETE EURO FILTERS FOR ALL THE TRACKS THAT HAVE DIED
        for (var f = this.euro_filter_list.length - 1; f >= 0; f--) {
            var track_id = this.euro_filter_list[f].track_id;
            var track_dead = true;
            for (var k = 0; k < centers.length; k++) {
                if (centers[k].id == track_id) {
                    track_dead = false;
                    break;
                }
            }
            if (track_dead) {
                this.euro_filter_list.splice(f, 1);
            }
        }

        // NOW CREATE EURO FILTERS FOR ALL THE NEW TRACKS
        for (var _k = 0; _k < centers.length; _k++) {
            var center_id = centers[_k].id;
            if (centers[_k].track_duration == 0) {
                var newFilterGroup = {
                    track_id: center_id,
                    euro_filter_2d: new global.EuroFilter2Djoint(
                        this.cfg.freq, this.cfg.mincutoff_2D, this.cfg.beta_2D, this.cfg.dcutoff_2D),
                    euro_filter_3d_xy: new global.EuroFilter2Djoint(
                        this.cfg.freq, this.cfg.mincutoff_XY, this.cfg.beta_XY, this.cfg.dcutoff_XY),
                    euro_filter_3d_z: new global.EuroFilter1D(
                        this.cfg.freq, this.cfg.mincutoff_Z, this.cfg.beta_Z, this.cfg.dcutoff_Z),
                    euro_filter_rot: new global.EuroFilterQuatNew(
                        this.cfg.freq, this.cfg.mincutoff_Rot, this.cfg.beta_Rot, this.cfg.dcutoff_Rot),
                };
                this.euro_filter_list.push(newFilterGroup);
            }
        }
    },

    findBestPair: function(centers, use_track_length) {
        /*
        FROM ALL THE DETECTED SHOES FINDS AND MARKS A PAIR OF SHOES.
        DEPENDING ON THE INPUT PARAMETER use_track_length IT WILL EITHER BE USING
        DETECTION SCORE OR TRACK LENGTH TO SELECT THE BEST PAIR. IF THE OPTION DISPLAY ONE PAIR OF FEET
        IS SELECTED, ONLY THE MARKED PAIR WILL BE DISPLAYED.
         */

        for (var i = 0; i < centers.length; i++) {
            centers[i].selectedPair = false;
        }
        if (centers.length > 0) {
            // Get shoe with highest score
            var maxScore = ((use_track_length) ? centers[0].track_duration : centers[0].score);
            var maxIndex = 0;
            for (var _i = 1; _i < centers.length; _i++) {
                var curScore = ((use_track_length) ? centers[_i].track_duration : centers[_i].score);
                if (curScore > maxScore) {
                    maxIndex = _i;
                    maxScore = curScore;
                }
            }
            var is_right = centers[maxIndex].is_right;

            centers[maxIndex].selectedPair = true;

            // Get opposite shoe with highest score
            var maxSecondaryScore = 0;
            var maxSecondaryIndex = -1;
            for (var _j = 0; _j < centers.length; _j++) {
                var curSecondaryScore = ((use_track_length) ? centers[_j].track_duration : centers[_j].score);
                var cur_is_right = centers[_j].is_right;
                if (cur_is_right !== is_right && curSecondaryScore > maxSecondaryScore) {
                    maxSecondaryIndex = _j;
                    maxSecondaryScore = curSecondaryScore;
                }
            }

            if (maxSecondaryIndex > -1) {
                centers[maxSecondaryIndex].selectedPair = true;
            }
        }
    },

    parametricDecoder: function(modelOutput, centers) {
        // 64x64x4
        var global_translation_tensor = modelOutput.outputGlobalTranslationTensor;
        // 64x64x12
        var global_rotation_tensor = modelOutput.outputGlobalRotationTensor;
        // 64x64x1
        var disparity_tensor = modelOutput.outputDisparityTensor;

        var fc_len = this.cfg.transformed_intrinsics[0];
        var c_x = this.cfg.transformed_intrinsics[2];
        var c_y = this.cfg.transformed_intrinsics[3];

        for (var i = 0; i < centers.length; i++) {
            var curX = centers[i].x;
            var curY = centers[i].y;
            var is_right = centers[i].is_right;
            // 4d-im
            var translation_vec_lr = global.sample_tensor2d_at_position(global_translation_tensor,
                [this.cfg.heatmapHeight, this.cfg.heatmapWidth, 4], curX, curY, this.cfg.stride);
            var rotation_vec_lr = global.sample_tensor2d_at_position(global_rotation_tensor,
                [this.cfg.heatmapHeight, this.cfg.heatmapWidth, 12], curX, curY, this.cfg.stride);


            var translation_vec = null;
            var rotation_vec = null;
            if (is_right) {
                translation_vec = translation_vec_lr.splice(2, 2);
                rotation_vec = rotation_vec_lr.splice(6, 6);
            } else {
                translation_vec = translation_vec_lr.splice(0, 2);
                rotation_vec = rotation_vec_lr.splice(0, 6);
            }

            var disparity_log = global.sample_tensor2d_at_position(disparity_tensor,
                [this.cfg.heatmapHeight, this.cfg.heatmapWidth], curX, curY, this.cfg.stride);
            var disparity = Math.exp(disparity_log);
            var rotmat = global.compute_rotation_matrix_from_ortho6d(rotation_vec);

            var Z_abs = 1.0 / (disparity + 1e-4);
            var x = translation_vec[0] + curX;
            var y = translation_vec[1] + curY;
            var X = Z_abs * (x - c_x);
            var Y = Z_abs * (y - c_y);
            var Z = Z_abs * fc_len;

            var positions_3D = new vec3(X, Y, Z);

            centers[i]["translation"] = positions_3D;
            centers[i]["rotmat"] = rotmat;
            centers[i]["Z_abs"] = Z_abs;

            // ADD QUATERNION, SINCE THIS IS USED FOR RENDERING
            var cur_quat = global.MathLib.quat.fromMat3(rotmat);
            cur_quat = global.MathLib.quat.toEngine(cur_quat);
            centers[i]["quat"] = cur_quat;

            // ROTATE BY 180 around x axis
            var rotation_quat = quat.fromEulerAngles(Math.PI, 0, 0);
            centers[i]["quat"] = rotation_quat.multiply(cur_quat);
            centers[i]["translation"] = rotation_quat.multiplyVec3(positions_3D);
        }
        return centers;
    },

    applyOneEuroFilterTo2DLocations: function(centers) {
        for (var i = 0; i < centers.length; i++) {
            var curX = centers[i].x;
            var curY = centers[i].y;

            var euroFilter2d;
            var eurofilter_found = false;
            for (var f = 0; f < this.euro_filter_list.length; f++) {
                var track_id = this.euro_filter_list[f].track_id;
                if (track_id == centers[i].id) {
                    euroFilter2d = this.euro_filter_list[f].euro_filter_2d;
                    eurofilter_found = true;
                    break;
                }
            }
            if (!eurofilter_found) {
                debugPrint("Warning: No 1euro filter was found for this center!", 2);
            }

            var image_coords = global.tex2img_coords([curX, curY], this.cfg.inputImageWidth, this.cfg.inputImageHeight,
                this.cfg.inputWidth, this.cfg.inputHeight);

            var xy = new vec2(image_coords[0], image_coords[1]);
            var filtered_xy = euroFilter2d.filter(xy);

            var texture_coords = global.img2tex_coords([filtered_xy.x, filtered_xy.y],
                this.cfg.inputImageWidth, this.cfg.inputImageHeight, this.cfg.inputWidth, this.cfg.inputHeight);

            centers[i].x = texture_coords[0];
            centers[i].y = texture_coords[1];
        }
    },

    applyOneEuroFilterTo3DLocations: function(centers) {
        for (var i = 0; i < centers.length; i++) {
            var translation = centers[i].translation;

            var translation_xy = new vec2(translation.x, translation.y);
            var translation_z = translation.z;

            var euroFilter_xy;
            var euroFilter_z;
            var eurofilter_found = false;
            for (var f = 0; f < this.euro_filter_list.length; f++) {
                var track_id = this.euro_filter_list[f].track_id;
                if (track_id == centers[i].id) {
                    euroFilter_xy = this.euro_filter_list[f].euro_filter_3d_xy;
                    euroFilter_z = this.euro_filter_list[f].euro_filter_3d_z;
                    eurofilter_found = true;
                    break;
                }
            }
            if (!eurofilter_found) {
                debugPrint("Warning: No 1euro filter was found for this center!", 1);
            }

            var filtered_translation_xy = euroFilter_xy.filter(translation_xy);
            var filtered_translation_z = euroFilter_z.filter(translation_z);
            var filtered_translation_joint = new vec3(
                filtered_translation_xy.x,
                filtered_translation_xy.y,
                filtered_translation_z
            );
            centers[i].translation = filtered_translation_joint;
        }
    },

    applyOneEuroFilterToRotations: function(centers) {
        for (var i = 0; i < centers.length; i++) {
            var quat = centers[i].quat;
            var euroFilterRotation;

            var eurofilter_found = false;
            for (var f = 0; f < this.euro_filter_list.length; f++) {
                var track_id = this.euro_filter_list[f].track_id;
                if (track_id == centers[i].id) {
                    euroFilterRotation = this.euro_filter_list[f].euro_filter_rot;
                    eurofilter_found = true;
                    break;
                }
            }
            if (!eurofilter_found) {
                debugPrint("Warning: No 1euro filter was found for this center!", 1);
            }

            var filtered_quat = euroFilterRotation.filter(quat);
            centers[i].quat = filtered_quat;
        }
    },

    decode_feet: function(modelOutput) {
        /**
         * This function receives as an input the output from the neural network, "modelOutput",
         * which should contain the following fields:
         *      outputDisparityTensor: 64x64x1
         *      outputCenterClassTensor: 64x64x1
         *      outputCenterShortOffsetsTensor: 64x64x2
         *      outputSparseLRClassTensor: 64x64x1
         *      outputGlobalTranslationTensor: 64x64x4
         *      outputGlobalRotationTensor: 64x64x12
         *
         * The output is a list with the detected feet, each of which has the following format:
         *  center = {
         *      x: x coordinate of the 2d center of the foot,
         *      y: y coordinate of the 2d center of the foot,
         *      isright: bool variable - True if we have the right foot,
         *      track_duration: num of frames the track of the current shoe has been alive for
         *      translation: (X,Y, Z) global 3D coordinates of the shoe in a vec3 format
         *      rotmat: global rotation of the shoe as a matrix
         *      quat: global rotation of the shoe as a quaternion
         *      matched: whether the current frame was matched with an older detection (new tracks, or old unmatched ones
         *      are not matched and won't be displayed)
         *      age: number of frames since the last time this detection was matched
         *  }
         *
         */

        /**
         * GET THE 2D LOCATIONS OF THE FEET ON THE IMAGE, STARTING FROM THE MODEL OUTPUT
         */
        var centers = this.new_center_decoder(modelOutput);

        /**
         * UPDATE ALL 1EURO FILTERS
         */
        this.update_euro_filters_list(centers);

        /**
         * MARK THE BEST PAIR
         */
        this.findBestPair(centers, true);

        /**
         * APPLY ONE EURO FILTERS FOR SMOOTHING THE 2D LOCATION
         */
        if (this.cfg.oneEuro2d_enabled) {
            this.applyOneEuroFilterTo2DLocations(centers);
        }

        /**
         * CALCULATE THE GLOBAL ROTATION AND TRANSLATION OF THE 3D SHOE MODELS
         */
        centers = this.parametricDecoder(modelOutput, centers);

        /**
         * APPLY ONE EURO FILTERS FOR SMOOTHING 3D LOCATION AND ROTATION
         */
        if (this.cfg.oneEuro3d_enabled) {
            this.applyOneEuroFilterTo3DLocations(centers);
        }
        
        if (this.cfg.oneEuroRotation_enabled) {
            this.applyOneEuroFilterToRotations(centers);
        }

        // COPY OLD CENTERS
        this.previousOpticalFlowCenters = centers.slice();

        return centers;
    }
};
