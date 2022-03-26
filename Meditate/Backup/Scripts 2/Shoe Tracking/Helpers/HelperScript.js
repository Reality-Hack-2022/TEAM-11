// HelperScript.js
// Version: 1.0.0
// Event: On Awake
// Description: Declares helping functions used in the other scripts

//@input int debugLevel 


function myround(num, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

function printArray(array) {
    var my_str = "[";
    for (var i = 0; i < array.length; ++i) {
        my_str += String(myround(array[i], 3)) + ", ";
    }
    my_str += "]";
    print(my_str);
}

function printTensor2D(array, dims) {
    print("TENSOR: " + dims);
    for (var row = 0; row < dims[0]; row++) {
        var my_row = "row "+ row + ": [";
        for (var col = 0; col < dims[1]; col++) {
            var ind_1d = index_2d(row, col, dims);
            my_row += String(myround(array[ind_1d], 3)) + ", ";
        }
        my_row += "]";
        print(my_row);
    }
    print("END TENSOR");
}

function debugPrint(msg, level, cfg) {
    /**
     * variable: cfg.DEBUG_GLOBAL can be used to print all messages with debug level lower or equal
     *
     * msg: the message to print
     * detail_level: 1->4   can be used to finetune which messages will be printed
     */
    if (script.debugLevel == 0) {
        return;
    }

    if (level <= script.debugLevel) {
        print(msg);
    }
}

function argsortThreshold(array, ascending, lower_threshold) {
    /**
     Return indices of sorted values, but also filter the ones with a value lower that lower_threshold
     array: array of values
     ascending: if true sorting is ascending
     lower_threshold: if not null, use to filter all values lower than the lower_threshold
     return argsort indices
     */
    var idx_values_pairs = [];
    var idx = [];
    for (var i = 0; i < array.length; i++) {
        if (lower_threshold !== null) {
            if (array[i] < lower_threshold) {
                continue;
            }
        }
        idx_values_pairs.push([i, array[i]]);  // Add index column for sorting
    }
    idx_values_pairs.sort(function(a, b) {
        if (ascending) {
            return a[1] - b[1];
        } else {
            return b[1] - a[1];
        }
    });
    for (var j = 0; j < idx_values_pairs.length; j++) {
        idx[j] = idx_values_pairs[j][0];
    }
    return idx;
}

function index_2d(ind_0, ind_1, dims) {
    /**
    converts 2d indices to 1d index for flat array
     ind_0 -> row index
     ind_1 -> col index
     dims -> list of sizes for each dimension (height, width)

     */
    return ind_0 * dims[1] + ind_1;
}

function index_3d(ind_0, ind_1, ind_2, dims) {
    /**
    converts 3d indices to 1d index for flat array
     ind_0 -> row index
     ind_1 -> col index
     ind_2 -> depth index
     dims -> list of sizes for each dimension (height, width, channels)
     */
    return ind_0 * dims[1] * dims[2] + ind_1 * dims[2] + ind_2;
}


function sample_tensor2d_at_position(tensor, dims, xr, yr, stride) {
    /**
    samples tensor array at (x_r, y_r) position. If "tensor" is 2d then a number is returned.
     If it's 3d then a vector is returned.
     dims -> list of sizes for every dimension of the array
     y_r -> y position
     x_r -> x position
     stride -> output_heatmap stride compared to input image
     */

    var scale = 1.0 / stride;
    xr = scale * xr;
    yr = scale * yr;

    var x0 = Math.floor(xr);
    var y0 = Math.floor(yr);
    var x1 = x0 + 1;
    if (x0 === xr) {
        x1 = x0;
    }
    var y1 = y0 + 1;
    if (y0 === yr) {
        y1 = y0;
    }

    var xlerp = x0 + 1 - xr;
    var ylerp = y0 + 1 - yr;

    var x0y0 = xlerp * ylerp;
    var x0y1 = xlerp * (1 - ylerp);
    var x1y0 = (1 - xlerp) * ylerp;
    var x1y1 = (1 - xlerp) * (1 - ylerp);

    var ndim = dims.length;

    if (ndim === 2) {
        // 2D SAMPLING
        var out = x0y0 * tensor[index_2d(y0, x0, dims)]
                + x0y1 * tensor[index_2d(y1, x0, dims)]
                + x1y0 * tensor[index_2d(y0, x1, dims)]
                + x1y1 * tensor[index_2d(y1, x1, dims)];
        return out;
    } else if (ndim == 3) {
        // 3D SAMPLING
        var num_channels = dims[2];
        var sampled_vec = Array(num_channels);
        for (var k = 0; k < num_channels; k++) {
            sampled_vec[k] = x0y0 * tensor[index_3d(y0, x0, k, dims)]
                            + x0y1 * tensor[index_3d(y1, x0, k, dims)]
                            + x1y0 * tensor[index_3d(y0, x1, k, dims)]
                            + x1y1 * tensor[index_3d(y1, x1, k, dims)];
        }
        return sampled_vec;
    } else {
        print("only supports arrays with number of dimensions in [2, 3]");
    }
}


function add_scalar_to_tensor_window(tensor, dims, scalar, x1,y1,x2,y2) {
    /**
     Adds constant scalar value to window of tensor

     tensor -> input tensor (results are added in place)
     dims -> list of sizes for every dimension of the array
     scalar -> constant value to add
     x1 -> starting column of window
     y1 -> starting row of window
     x2 -> ending (including) column of window
     y2 -> ending (including) row of window

     */

    for (var row = y1; row <= y2; row++) {
        for (var col = x1; col <= x2; col++) {
            tensor[index_2d(row, col, dims)] += scalar;
        }
    }
}



function compute_rotation_matrix_from_ortho6d(poses) {
    /**
     * poses: [6,] vector
     *
     * returns:
     *      matrix: [3,3] rotation matrix
     */

    var x_raw_vec = new global.MathLib.vec3(poses[0], poses[1], poses[2]);
    var y_raw_vec = new global.MathLib.vec3(poses[3], poses[4], poses[5]);

    var x_raw_norm = x_raw_vec.getLength();
    var x_vec = x_raw_vec.uniformScale(1/(x_raw_norm + 1e-8));

    var z_raw_vec = x_vec.cross(y_raw_vec);
    var z_raw_norm = z_raw_vec.getLength();
    var z_vec = z_raw_vec.uniformScale(1/(z_raw_norm + 1e-8));

    var y_vec = z_vec.cross(x_vec);

    var matrix = new global.MathLib.mat3();
    matrix.column0 = x_vec;
    matrix.column1 = y_vec;
    matrix.column2 = z_vec;

    return matrix;
}


function setArrayToScalar(array, scalar) {
    for (var i = 0; i < array.length; ++i) {
        array[i] = scalar;
    }
}


function person_agnostic_crop(w, h, crop_width, crop_height) {
    var aspect_ratio = crop_width / crop_height;
    // Compute the smallest box that has the same aspect ratio as the
    // crop and fully contains the image. This will be larger (or equal in the extreme case) than the image

    var new_w = w;
    var new_h = h;
    if (w > aspect_ratio * h) {
        new_h = w / aspect_ratio;
    } else {
        new_w = h * aspect_ratio;
    }

    var c_x = w/2;
    var c_y = h/2;

    return [c_x, c_y, new_w, new_h];
}

function tex2img_coords(tex_coords, w, h, crop_width, crop_height) {
    // TEXTURE is the size of the input to the neural network. IMAGE is the input from the camera device
    // tex_coords: tuple containing [x,y] coordinates in texture space
    // returns tuple containing [x,y] coordinates in image space

    var new_size_cwh = person_agnostic_crop(w, h, crop_width, crop_height);
    var new_w = new_size_cwh[2];
    var new_h = new_size_cwh[3];

    var x = tex_coords[0];
    var y = tex_coords[1];

    var img_x = (x - crop_width/2)*new_w/crop_width + w/2; // OR (x/crop_width - 0.5)*new_w + w/2
    var img_y = (y - crop_height/2)*new_h/crop_height + h/2; // OR (y/crop_height - 0.5)*new_h + h/2

    return [img_x, img_y];
}

function img2tex_coords(img_coords, w, h, crop_width, crop_height) {
    // TEXTURE is the size of the input to the neural network. IMAGE is the input from the camera device
    // img_coords: tuple containing [x,y] coordinates in image space
    // returns tuple containing [x,y] coordinates in texture space

    var new_size_cwh = person_agnostic_crop(w, h, crop_width, crop_height);
    var new_w = new_size_cwh[2];
    var new_h = new_size_cwh[3];

    var x = img_coords[0];
    var y = img_coords[1];

    var text_x = (x - w/2)*crop_width/new_w + crop_width/2; // OR (x/new_w - 0.5)*w + crop_width/2
    var text_y = (y - h/2)*crop_height/new_h + crop_height/2; // OR (y/new_h - 0.5)*h + crop_height/2

    return [text_x, text_y];
}


function get_transform(input_w, input_h, crop_width, crop_height) {
    /**
     * input_w: input_image width
     * input_h: input_image height
     * crop_width:  crop_width
     * crop_height:  crop_height
     * return:
     *   trans: [2,3] matrix transforming from input_image coordinates to crop_image coordinates.
     */

    var new_size_cwh = person_agnostic_crop(input_w, input_h, crop_width, crop_height);

    var c_x = new_size_cwh[0];
    var c_y = new_size_cwh[1];

    var src_h = new_size_cwh[3];

    var dst_w = crop_width;
    var dst_h = crop_height;

    var r = dst_h / src_h;

    var trans = [[r, 0, -r * c_x + dst_w / 2], [0, r, -r * c_y + dst_h / 2]];

    return trans;
}


function compute_transform_jacobian(trans) {
    return trans[0][0] * trans[1][1] - trans[0][1] * trans[1][0];
}


function transform_intrinsics(trans, intrinsics) {
    /**
     * trans: 2x3 array of arrays
     * intrinsics: 1x4 array containing [cx, cy, fx, fy]
     * return:
     *      transformed_intrinsics: 1x4 array containing the new [cx, cy, fx, fy]
     */

    var jacobian = compute_transform_jacobian(trans);
    var scale = Math.sqrt(Math.abs(jacobian));
    var transformed_intrinsics = [];
    transformed_intrinsics[0] = intrinsics[0] * scale;
    transformed_intrinsics[1] = intrinsics[1] * scale;

    var cx = intrinsics[2];
    var cy = intrinsics[3];

    transformed_intrinsics[2] = trans[0][0]*cx + trans[0][1]*cy + trans[0][2];
    transformed_intrinsics[3] = trans[1][0]*cx + trans[1][1]*cy + trans[1][2];

    return transformed_intrinsics;
}


global.myround = myround;
global.printArray = printArray;
global.printTensor2D = printTensor2D;
global.argsortThreshold = argsortThreshold;
global.sample_tensor2d_at_position = sample_tensor2d_at_position;
global.compute_rotation_matrix_from_ortho6d = compute_rotation_matrix_from_ortho6d;
global.setArrayToScalar = setArrayToScalar;
global.add_scalar_to_tensor_window = add_scalar_to_tensor_window;
global.tex2img_coords = tex2img_coords;
global.img2tex_coords = img2tex_coords;
global.get_transform = get_transform;
global.transform_intrinsics = transform_intrinsics;
global.debugPrint = debugPrint;
