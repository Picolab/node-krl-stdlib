var _ = require("lodash");
var cuid = require("cuid");
var randomWords = require("random-words");

//same as stdlib.isnull without `ctx`
var isnull = function(val){
    return val === null || val === undefined || _.isNaN(val);
};

//same as stdlib.typeof without `ctx`
var typeofKRL = function(val){
    if(isnull(val)){
        return "Null";
    }else if(val === true || val === false){
        return "Boolean";
    }else if(_.isString(val)){
        return "String";
    }else if(_.isNumber(val) && !_.isNaN(val)){
        return "Number";
    }else if(_.isRegExp(val)){
        return "RegExp";
    }else if(_.isArray(val)){
        return "Array";
    }else if(_.isPlainObject(val)){
        return "Map";
    }else if(_.isFunction(val)){
        return "Function";
    }
    return "JSObject";
};

//same as `stdlib.as(ctx, val, "String")` without `ctx` and `type`
var toString = function(val){
    var val_type = typeofKRL(val);
    if(val_type === "String"){
        return val;
    }else if(val_type === "Null"){
        return "null";
    }else if(val_type === "Boolean"){
        return val ? "true" : "false";
    }else if(val_type === "Number"){
        return val + "";
    }else if(val_type === "RegExp"){
        return "re#" + val.source + "#" + val.flags;
    }
    return "[" + val_type + "]";
};

//coerce the value into a key string
var toKey = function(val){
    return toString(val);
};

//coerce the value into an array of key strings
var toKeyPath = function(path){
    if(!_.isArray(path)){
        path = [path];
    }
    return _.map(path, toKey);
};

var iterBase = function*(val, iter){
    var should_continue;
    if(_.isArray(val)){
        var i;
        for(i = 0; i < val.length; i++){
            should_continue = yield iter(val[i], i, val);
            if(!should_continue) break;
        }
    }else{
        var key;
        for(key in val){
            if(_.has(val, key)){
                should_continue = yield iter(val[key], key, val);
                if(!should_continue) break;
            }
        }
    }
};


var stdlib = {};

var defVarArgOp = function(op, reducer){
    stdlib[op] = function(){
        if(arguments.length < 2){
            return;
        }
        var r = arguments[1];
        if(op === "-" && arguments.length === 2){
            return -r;
        }
        var i;
        for(i = 2; i < arguments.length; i++){
            r = reducer(r, arguments[i]);
        }
        return r;
    };
};

defVarArgOp("<", function(r, a){
    return r < a;
});
defVarArgOp(">", function(r, a){
    return r > a;
});
defVarArgOp("<=", function(r, a){
    return r <= a;
});
defVarArgOp(">=", function(r, a){
    return r >= a;
});
defVarArgOp("==", function(r, a){
    if(r === a){
        return true;
    }
    return isnull(r) && isnull(a);
});
defVarArgOp("!=", function(r, a){
    if(r === a){
        return false;
    }
    return !(isnull(r) && isnull(a));
});

var normalizePlusArg = function(v){
    if(isnull(v)){
        return 0;
    }
    if(_.isNumber(v)){
        return v;
    }
    return toString(v);
};
defVarArgOp("+", function(r, a){
    r = normalizePlusArg(r);
    a = normalizePlusArg(a);
    return r + a;
});
defVarArgOp("-", function(r, a){
    return r - a;
});
defVarArgOp("*", function(r, a){
    return r * a;
});
defVarArgOp("/", function(r, a){
    return r / a;
});
defVarArgOp("%", function(r, a){
    return r % a;
});

stdlib.beesting = function(ctx, val){
    return stdlib["as"](ctx, val, "String");
};

////////////////////////////////////////////////////////////////////////////////
//
//Operators
//
stdlib["><"] = function(ctx, obj, val){
    if(_.isArray(obj)){
        return _.indexOf(obj,val) >= 0;
    }else if(_.isPlainObject(obj)){
        return _.indexOf(_.keys(obj),val) >= 0;
    }else{
        return false;
    }
};
stdlib.as = function(ctx, val, type){
    var val_type = stdlib["typeof"](ctx, val);
    if(val_type === type){
        return val;
    }
    if(type === "Boolean"){
        if(val === "false"){
            return false;
        }
        if(val_type === "Number"){
            return val !== 0;
        }
        return !!val;
    }
    if(type === "String"){
        return toString(val);
    }
    if(type === "Number"){
        if(val_type === "Null"){
            return 0;
        }else if(val_type === "Boolean"){
            return val ? 1 : 0;
        }else if(val_type === "String"){
            var n = parseFloat(val);
            return _.isNumber(n) && !_.isNaN(n)
                ? n
                : null;
        }
    }
    if(type === "RegExp"){
        if(val_type === "String"){
            return new RegExp(val);
        }
    }
    throw new Error("Cannot use .as(\""+type+"\") operator with " + JSON.stringify(val) + " " + val_type);
};

stdlib.isnull = function(ctx, val){
    return isnull(val);
};

stdlib.klog = function(ctx, val, message){
    ctx.emit("klog", val, message);
    return val;
};

stdlib["typeof"] = function(ctx, val){
    return typeofKRL(val);
};

stdlib.sprintf = function(ctx, val, template){
    if(_.isNumber(val)){
        return template.replace(/%d/g, val + "");
    }else if(_.isString(val)){
        return template.replace(/%s/g, val);
    }
    return template;
};

stdlib.defaultsTo = function(ctx, val, defaultVal, message){
    if(isnull(val)){
        if(message !== undefined) ctx.emit("debug", "[DEFAULTSTO] " + message);
        return defaultVal;
    } else {
        return val;
    }
};

//Number operators//////////////////////////////////////////////////////////////
stdlib.chr = function(ctx, val){
    return String.fromCharCode(val);
};
stdlib.range = function(ctx, val, end){
    return _.range(val, end + 1);
};

//String operators//////////////////////////////////////////////////////////////
stdlib.capitalize = function(ctx, val){
    return val[0].toUpperCase() + val.slice(1);
};
stdlib.decode = function(ctx, val){
    if(!_.isString(val)){
        return val;
    }
    try{
        return JSON.parse(val);
    }catch(e){
        return val;
    }
};
stdlib.extract = function(ctx, val, regex){
    var r = val.match(regex);
    if(!r){
        return [];
    }
    if(regex.global){
        return r;
    }
    return r.slice(1);
};
stdlib.lc = function(ctx, val){
    return val.toLowerCase();
};
stdlib.match = function(ctx, val, regex){
    return regex.test(val);
};
stdlib.ord = function(ctx, val){
    var code = val.charCodeAt(0);
    return _.isNaN(code) ? undefined : code;
};
stdlib.replace = function(ctx, val, regex, replacement){
    return val.replace(regex, replacement);
};
stdlib.split = function(ctx, val, split_on){
    return val.split(split_on);
};
stdlib.substr = function(ctx, val, start, len){
    if(start > val.length){
        return;
    }
    var end;
    if(len === undefined){
        end = val.length;
    }else{
        if(len > 0){
            end = start + len;
        }else{
            end = val.length + len;
        }
    }
    return val.substring(start, end);
};
stdlib.uc = function(ctx, val){
    return val.toUpperCase();
};

//Collection operators//////////////////////////////////////////////////////////
stdlib.all = function*(ctx, val, iter){
    var broke = false;
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(!r){
            broke = true;
            return false;//stop
        }
        return true;
    });
    return !broke;
};
stdlib.notall = function*(ctx, val, iter){
    return !(yield stdlib.all(ctx, val, iter));
};
stdlib.any = function*(ctx, val, iter){
    var broke = false;
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(r){
            broke = true;
            return false;//stop
        }
        return true;
    });
    return broke;
};
stdlib.none = function*(ctx, val, iter){
    return !(yield stdlib.any(ctx, val, iter));
};
stdlib.append = function(ctx, val, others){
    return _.concat.apply(void 0, _.tail(_.toArray(arguments)));
};
stdlib.collect = function*(ctx, val, iter){
    var grouped = {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(!grouped.hasOwnProperty(r)){
            grouped[r] = [];
        }
        grouped[r].push(v);
        return true;
    });
    return grouped;
};
stdlib.filter = function*(ctx, val, iter){
    var is_array = _.isArray(val);
    var rslt = is_array ? [] : {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(r){
            if(is_array){
                rslt.push(v);
            }else{
                rslt[k] = v;
            }
        }
        return true;
    });
    return rslt;
};
stdlib.head = function(ctx, val){
    return _.head(val);
};
stdlib.tail = function(ctx, val){
    return _.tail(val);
};
stdlib.index = function(ctx, val, elm){
    return _.indexOf(val, elm);
};
stdlib.join = function(ctx, val, str){
    return _.join(val, str);
};
stdlib.length = function(ctx, val){
    return _.size(val);
};
stdlib.map = function*(ctx, val, iter){
    var is_array = _.isArray(val);
    var rslt = is_array ? [] : {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(is_array){
            rslt.push(r);
        }else{
            rslt[k] = r;
        }
        return true;
    });
    return rslt;
};
stdlib.pairwise = function*(/*ctx, val..., iter*/){
    var args = _.toArray(arguments);
    var ctx = args[0];
    var iter = args[args.length - 1];
    args = args.slice(1, args.length - 1);

    var max_len = _.max(_.map(args, _.size));

    var r = [];

    var i;
    var j;
    var args2;
    for(i = 0; i < max_len; i++){
        args2 = [];
        for(j = 0; j < args.length; j++){
            args2.push(args[j][i]);
        }
        r.push(yield iter(ctx, args2));
    }
    return r;
};
stdlib.reduce = function*(ctx, val, iter, dflt){
    var no_default = arguments.length < 4;
    if(_.size(val) === 0){
        return no_default ? 0 : dflt;
    }
    if(_.size(val) === 1){
        if(no_default){
            return _.head(val);
        }
        return iter(ctx, [dflt, _.head(val)]);
    }
    var acc = dflt;
    var is_first = true;
    yield iterBase(val, function*(v, k, obj){
        if(is_first && no_default){
            is_first = false;
            acc = v;
            return true;//continue
        }
        acc = yield iter(ctx, [acc, v, k, obj]);
        return true;//continue
    });
    return acc;
};
stdlib.reverse = function(ctx, val){
    return _.reverse(_.clone(val));
};
stdlib.slice = function(ctx, val, start, end){
    if(start < 0 || start > _.size(val)){
        return;
    }
    if(arguments.length < 4){
        return _.slice(val, 0, start + 1);
    }
    if(end < 0 || end > _.size(val)){
        return;
    }
    return _.slice(val, start, end + 1);
};
stdlib.splice = function(ctx, val, start, n_elms, value){
    var part1 = _.slice(val, 0, start);
    var part2 = _.slice(val, start + n_elms);
    if(arguments.length < 5){
        return _.concat(part1, part2);
    }
    return _.concat(part1, value, part2);
};
stdlib.sort = (function(){
    var sorters = {
        "numeric": function(a, b){
            return a < b ? -1 : (a == b ? 0 : 1);
        },
        "ciremun": function(a, b){
            return a < b ? 1 : (a == b ? 0 : -1);
        }
    };
    var swap = function(arr, i, j){
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    };
    return function*(ctx, val, sort_by){
        if(sort_by === "reverse"){
            //TODO optimize by making a "reverse" sorter function
            return _.clone(val).sort().reverse();
        }else if(_.has(sorters, sort_by)){
            return _.clone(val).sort(sorters[sort_by]);
        }else if(!_.isFunction(sort_by)){
            return _.clone(val).sort();
        }
        var sorted = _.clone(val);
        var i, j, a, b;
        var len = sorted.length;
        for (i = len - 1; i >= 0; i--){
            for(j = 1; j <= i; j++){
                a = sorted[j-1];
                b = sorted[j];
                if((yield sort_by(ctx, [a, b])) > 0){
                    swap(sorted, j-1, j);
                }
            }
        }
        return sorted;
    };
}());
stdlib["delete"] = function(ctx, val, path){
    path = toKeyPath(path);
    //TODO optimize
    var n_val = _.cloneDeep(val);
    _.unset(n_val, path);
    return n_val;
};
stdlib.put = function(ctx, val, path, to_set){
    if(arguments.length < 3){
        return val;
    }
    if(arguments.length < 4){
        to_set = path;
        path = [];
    }
    path = toKeyPath(path);
    if(_.isEmpty(path)){
        return _.assign({}, val, to_set);
    }
    //TODO optimize
    var n_val = _.cloneDeep(val);
    _.update(n_val, path, function(at_p){
        if(_.isPlainObject(to_set)){
            return _.assign(at_p, to_set);
        }
        return to_set;
    });
    return n_val;
};
stdlib.encode = function(ctx, val){
    //TODO options???
    return JSON.stringify(val);
};
stdlib.keys = function(ctx, val, path){
    if(path){
        path = toKeyPath(path);
        return _.keys(_.get(val, path));
    }
    return _.keys(val);
};
stdlib.values = function(ctx, val, path){
    if(path){
        path = toKeyPath(path);
        return _.values(_.get(val, path));
    }
    return _.values(val);
};
stdlib.intersection = function(ctx, a, b){
    return _.intersection(a, b);
};
stdlib.union = function(ctx, a, b){
    return _.unionWith(a, b, _.isEqual);
};
stdlib.difference = function(ctx, a, b){
    return _.differenceWith(a, b, _.isEqual);
};
stdlib.has = function(ctx, val, other){
    return _.every(other, function(e){
        return _.includes(val, e);
    });
};
stdlib.once = function(ctx, val){
    //TODO optimize
    var r = [];
    _.each(_.groupBy(val), function(group){
        if(_.size(group) === 1){
            r.push(_.head(group));
        }
    });
    return r;
};
stdlib.duplicates = function(ctx, val){
    //TODO optimize
    var r = [];
    _.each(_.groupBy(val), function(group){
        if(_.size(group) > 1){
            r.push(_.head(group));
        }
    });
    return r;
};
stdlib.randomWord = function(ctx){
    return randomWords();
};
stdlib.uuid = function(ctx){
    return cuid();
};

stdlib.unique = function(ctx, val){
    return _.uniq(val);
};

stdlib["get"] = function(ctx, obj, path) {
    path = toKeyPath(path);
    return _.get(obj,path);
};

stdlib["set"] = function(ctx, obj, path, val) {
    path = toKeyPath(path);
    //TODO optimize
    return _.set(_.cloneDeep(obj), path, val);
};

module.exports = stdlib;
