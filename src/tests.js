var _ = require("lodash");
var cocb = require("co-callback");
var test = require("tape");
var types = require("./types");
var stdlib = require("./");

var ylibFn = function(fn_name, args){
    args = [defaultCTX].concat(args);
    var fn = stdlib[fn_name];
    if(cocb.isGeneratorFunction(fn)){
        return cocb.promiseRun(function*(){
            return yield fn.apply(void 0, args);
        });
    }
    return new Promise(function(resolve, reject){
        try{
            resolve(fn.apply(void 0, args));
        }catch(err){
            reject(err);
        }
    });
};

var defaultCTX = {
    emit: _.noop
};

var action = function(){};
action.is_an_action = true;

//wrap lambdas as KRL Closures
var mkClosure = function(args){
    return _.map(args, function(arg){
        if(types.isFunction(arg)){
            return function(ctx, args){
                return arg.apply(this, args);
            };
        }
        return arg;
    });
};

var testFn = function(t, fn, args, expected, emitType, errType, message){
    if(arguments.length === 5){
        message = emitType;
        emitType = void 0;
    }

    var mkCtx = function(emitType, errType){
        return {
            emit: function(kind, err){
                t.equals(kind, emitType);
                t.equals(err.name, errType);
            }
        };
    };

    args = mkClosure(args);
    var emitCTX = mkCtx(emitType, errType);
    t.deepEqual(stdlib[fn].apply(null, [emitCTX].concat(args)), expected, message);
};

var testFnErr = function(t, fn, args, type, message){
    args = mkClosure(args);
    try{
        stdlib[fn].apply(null, [defaultCTX].concat(args));
        t.fail("Failed to throw an error");
    }catch(err){
        t.equals(err.name, type, message);
    }
};

var tfMatrix = function(tf, args, exp){
    var i;
    for(i=0; i < exp.length; i++){
        var j;
        for(j=0; j < args.length; j++){
            tf(exp[i][0], args[j], exp[i][j+1]);
        }
    }
};

var ytfMatrix = function*(ytf, obj, args, exp){
    var i;
    for(i=0; i < exp.length; i++){
        var j;
        for(j=0; j < args.length; j++){
            yield ytf(exp[i][0], [obj, args[j]], exp[i][j+1]);
        }
    }
};

var mkTfMap = function(args){
    return _.map(args, function(arg){
        if(cocb.isGeneratorFunction(arg)){
            return function*(ctx, args){
                return yield arg.apply(this, args);
            };
        }else if(types.isFunction(arg)){
            return cocb.toYieldable(function(ctx, args, callback){
                var data;
                try{
                    data = arg.apply(this, args);
                }catch(err){
                    callback(err);
                    return;
                }
                callback(null, data);
            });
        }
        return arg;
    });
};

var mkTf = function(t){
    return function*(fn, args, expected, message){
        args = mkTfMap(args);
        t.deepEqual(
            yield ylibFn(fn, args),
            expected,
            message
        );
    };
};

var mkTfe = function(t){
    return function*(fn, args, type, message){
        args = mkTfMap(args);
        try{
            yield ylibFn(fn, args);
            t.fail("Failed to throw an error");
        }catch(err){
            t.equals(err.name, type, message);
        }
    };
};

var ytest = function(msg, body){
    test(msg, function(t){
        var tf = _.partial(testFn, t);
        var tfe = _.partial(testFnErr, t);
        var ytf = mkTf(t);
        var ytfe = mkTfe(t);
        var ytfm = _.partial(ytfMatrix, ytf);
        cocb.run(body(t, ytfm, ytfe, ytf, tfe, tf), t.end);
    });
};

test("infix operators", function(t){
    var tf = _.partial(testFn, t);
    var tfe = _.partial(testFnErr, t);

    tf("+", [1], 1);
    tf("+", [-1], -1);
    tf("+", [1, 2], 3);
    tf("+", [2.3, .1], 2.4);

    //concat +
    tf("+", [1, null], "1null");
    tf("+", [null, 1], "null1");
    tf("+", [1, false], "1false");
    tf("+", [false, 1], "false1");
    tf("+", [_.noop, "foo"], "[Function]foo");
    tf("+", [1, true], "1true");
    tf("+", ["wat", 100], "wat100");
    tf("+", [{}, []], "[Map][Array]");

    tf("-", [2], -2);
    tf("-", ["-2"], 2);
    tfe("-", ["zero"], "TypeError");
    tfe("-", [[0]], "TypeError");
    tfe("-", [{}], "TypeError");

    tf("-", [1, 3], -2);
    tf("-", ["1", 3], -2);
    tf("-", [4, "1"], 3);
    tf("-", ["4", "1"], 3);
    tfe("-", ["two", 1], "TypeError");
    tfe("-", [[], "-1"], "TypeError");

    tf("==", [null, NaN], true);
    tf("==", [NaN, void 0], true);
    tf("==", [null, void 0], true);
    tf("==", [NaN, NaN], true);
    tf("==", [null, 0], false);
    tf("==", [0, null], false);
    tf("==", [0, void 0], false);
    tf("==", [0, NaN], false);
    tf("==", [false, null], false);
    tf("==", [true, 1], false);

    tfMatrix(tf, [
        [2, 10],              // 1
        [6, 6],               // 2
        [10, 2],              // 3
        ["2", "10"],          // 4
        ["6", "6"],           // 5
        ["10", "2"],          // 6
        [NaN, null],          // 7
        [["a", 0], ["a", 0]], // 8
        [{"a": 0}, {"a": 0}], // 9
        [["a", 0], ["b", 1]], // 10
        [{"a": 1}, {"b": 0}], // 11
    ], [        // 1      2      3      4      5      6      7      8      9     10     11
        ["<",   true, false, false, false, false,  true, false, false, false, false, false],
        [">",  false, false,  true,  true, false, false, false, false, false, false, false],
        ["<=",  true,  true, false, false,  true,  true,  true,  true,  true, false, false],
        [">=", false,  true,  true,  true,  true, false,  true,  true,  true, false, false],
        ["==", false,  true, false, false,  true, false,  true,  true,  true, false, false],
        ["!=",  true, false,  true,  true, false,  true, false, false, false,  true,  true],
    ]);

    tf("*", [5, 2], 10);
    tfe("*", ["two", 1], "TypeError");
    tfe("*", [[], "-1"], "TypeError");

    tf("/", [4, 2], 2);
    tfe("/", ["two", 1], "TypeError");
    tfe("/", [[], "-1"], "TypeError");
    tfe("/", ["1", "0"], "RangeError");

    tf("%", [4, 2], 0);
    tf("%", ["1", "0"], 0);
    tfe("%", [1, "two"], "TypeError");
    tfe("%", [[], "-1"], "TypeError");

    tf("like", ["wat", /a/], true);
    tf("like", ["wat", /b/], false);
    tf("like", ["wat", "da"], false);
    tf("like", ["wat", "a.*?(a|t)"], true);

    tf("<=>", ["5", "10"], -1);
    tf("<=>", [5, "5"], 0);
    tf("<=>", ["10", 5], 1);
    tf("<=>", [{" ":-.5}, {" ":-.5}], 0);
    tf("<=>", [NaN, void 0], 0);
    tfe("<=>", [null, 0], "TypeError");
    tfe("<=>", [[0, 1], [1, 1]], "TypeError");

    tf("cmp", ["aab", "abb"], -1);
    tf("cmp", ["aab", "aab"], 0);
    tf("cmp", ["abb", "aab"], 1);
    tf("cmp", [void 0, NaN], 0);
    tf("cmp", ["5", "10"], 1);
    tf("cmp", [5, "5"], 0);
    tf("cmp", ["10", 5], -1);
    tf("cmp", [{"":-.5}, {" ":.5}], 0);
    tf("cmp", [[], [[""]]], 0);
    tf("cmp", [null, 0], 1);

    t.end();
});

test("type operators", function(t){

    var tf = _.partial(testFn, t);
    var tfe = _.partial(testFnErr, t);

    tf("as", [1, "String"], "1");
    tf("as", [.32, "String"], "0.32");
    tf("as", [0, "String"], "0");
    tf("as", [null, "String"], "null");
    tf("as", [void 0, "String"], "null");
    tf("as", [NaN, "String"], "null");
    tf("as", [true, "String"], "true");
    tf("as", [false, "String"], "false");
    tf("as", ["str", "String"], "str");
    tf("as", [/^a.*b/, "String"], "re#^a.*b#");
    tf("as", [/^a.*b/gi, "String"], "re#^a.*b#gi");
    tf("as", [_.noop, "String"], "[Function]");
    tf("as", [[1,2], "String"], "[Array]");
    tf("as", [{}, "String"], "[Map]");
    tf("as", [arguments, "String"], "[Map]");

    tf("as", ["-1.23", "Number"], -1.23);
    tf("as", [42, "Number"], 42);
    tf("as", [true, "Number"], 1);
    tf("as", [false, "Number"], 0);
    tf("as", [null, "Number"], 0);
    tf("as", [NaN, "Number"], 0);
    tf("as", [void 0, "Number"], 0);
    tf("as", ["foo", "Number"], null);
    tf("as", [[1,2], "Number"], null);
    tf("as", [arguments, "Number"], null);

    t.equals(stdlib.as(defaultCTX, "^a.*z$", "RegExp").source, /^a.*z$/.source);
    var test_regex = /^a.*z$/;
    tf("as", [test_regex, "RegExp"], test_regex);
    tf("as", ["true", "Boolean"], true);
    tf("as", ["false", "Boolean"], false);
    tf("as", [0, "Boolean"], false);
    tfe("as", ["0", "num"], "TypeError");
    tfe("as", [{}, /boolean/], "TypeError");

    tf("isnull", [], true);
    tf("isnull", [void 0], true);
    tf("isnull", [null], true);
    tf("isnull", [NaN], true);
    tf("isnull", [false], false);
    tf("isnull", [0], false);
    tf("isnull", [""], false);
    tf("isnull", [{}], false);

    tf("typeof", [""], "String");
    tf("typeof", [0], "Number");
    tf("typeof", [-.01], "Number");
    tf("typeof", [10e10], "Number");
    tf("typeof", [true], "Boolean");
    tf("typeof", [false], "Boolean");
    tf("typeof", [void 0], "Null");
    tf("typeof", [null], "Null");
    tf("typeof", [NaN], "Null");
    tf("typeof", [/a/], "RegExp");
    tf("typeof", [[]], "Array");
    tf("typeof", [{}], "Map");
    tf("typeof", [_.noop], "Function");
    tf("typeof", [arguments], "Map");

    //special tests for Map detection
    t.equals(types.isMap(null), false);
    t.equals(types.isMap(void 0), false);
    t.equals(types.isMap(NaN), false);
    t.equals(types.isMap(_.noop), false);
    t.equals(types.isMap(/a/i), false);
    t.equals(types.isMap([1, 2]), false);
    t.equals(types.isMap(new Array(2)), false);
    t.equals(types.isMap("foo"), false);
    t.equals(types.isMap(new String("bar")), false);
    t.equals(types.isMap(10), false);
    t.equals(types.isMap(new Number(10)), false);

    t.equals(types.isMap({}), true);
    t.equals(types.isMap({a: 1, b: 2}), true);
    t.equals(types.isMap(arguments), true);

    t.equals(stdlib["typeof"](defaultCTX, action), "Action");

    t.end();
});

test("number operators", function(t){
    var tf = _.partial(testFn, t);

    tf("chr", [74], "J");
    tf("chr", ["no"], null);

    tf("range", [0, 0], [0]);
    tf("range", ["0", 10], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    tf("range", [1, "-6"], [1, 0, -1, -2, -3, -4, -5, -6]);
    tf("range", ["-1.5", "-3.5"], [-1.5, -2.5, -3.5]);
    tf("range", [-4], []);
    tf("range", [null, 0], []);
    tf("range", [0, []], []);

    tf("sprintf", [.25], "");
    tf("sprintf", [.25, "That is %s"], "That is %s");
    tf("sprintf", [.25, "%d = %d"], "0.25 = 0.25");
    tf("sprintf", [.25, "\\%s%d\\\\n = .25%s"], "\\%s0.25\\n = .25%s");
    tf("sprintf", [.25, "%\\d%d\\\\\\%dd\\n"], "%\\d0.25\\%dd\\n");
    tf("sprintf", [_.noop, void 0], "null");

    t.end();
});

test("string operators", function(t){
    var tf = _.partial(testFn, t);

    tf("sprintf", ["Bob"], "");
    tf("sprintf", ["Bob", "Yo"], "Yo");
    tf("sprintf", ["Bob", "%s is %s"], "Bob is Bob");
    tf("sprintf", ["Bob", "\\%d%s\\\\n is Bob%d"], "\\%dBob\\n is Bob%d");
    tf("sprintf", ["Bob", "%\\s%s\\\\\\%ss\\n"], "%\\sBob\\%ss\\n");
    tf("sprintf", [_.noop, "Hi %s!"], "Hi %s!");
    tf("sprintf", [{}, "Hey."], "Hey.");

    tf("capitalize", ["lower"], "Lower");
    tf("capitalize", [""], "");
    tf("capitalize", [" l"], " l");

    tf("decode", ["[1,2,3]"], [1, 2, 3]);
    tf("decode", [[1, 2, null]], [1, 2, null], "if not a string, return it");
    tf("decode", [void 0], void 0, "if not a string, just return it");
    tf("decode", ["[1,2"], "[1,2", "if parse fails, just return it");
    tf("decode", ["[1 2]"], "[1 2]", "if parse fails, just return it");

    tf("extract", ["3 + 2 - 1"], []);
    tf("extract", ["3 + 2 - 1", /([0-9])/g], ["3", "2", "1"]);
    tf("extract", ["no-match", /([0-9])/g], []);
    tf("extract", ["This is a string", /(is)/], ["is"]);
    tf("extract", ["This is a string", /(s.+).*(.ing)/], ["s is a st", "ring"]);
    tf("extract", ["This is a string", /(boot)/], []);
    tf("extract", ["I like cheese", /like (\w+)/], ["cheese"]);
    tf("extract", ["I like cheese", /(e)/g], ["e", "e", "e", "e"]);
    tf("extract", ["I like cheese", "(ch.*)"], ["cheese"], "convert strings to RegExp");
    tf("extract", ["what the null?", /null/], []);
    tf("extract", ["what the null?", void 0], []);

    tf("lc", ["UppER"], "upper");

    tf("match", ["3 + 2 - 1", "([0-9])"], true);
    tf("match", ["no-match", /([0-9])/g], false);
    tf("match", ["1", 1], false);
    tf("match", [0, /0/], true);

    tf("ord", [""], null);
    tf("ord", ["a"], 97);
    tf("ord", ["bill"], 98);
    tf("ord", ["0"], 48);

    tf("replace", ["william W.", /W/i], "illiam W.");
    tf("replace", ["William W.", /W/g, "B"], "Billiam B.");
    tf("replace", ["Sa5m", 5, true], "Satruem");
    tf("replace", [[false, void 0], /(?:)/ig], "[Array]");
    tf("replace", [[false, void 0]], [false, void 0]);

    tf("split", ["a;b;3;4;", /;/], ["a", "b", "3", "4", ""]);
    tf("split", ["a;b;3;4;", ""], ["a", ";", "b", ";", "3", ";", "4", ";"]);
    tf("split", ["33a;b;3;4;", 3], ["", "", "a;b;", ";4;"]);

    tf("substr", ["This is a string", 5], "is a string");
    tf("substr", ["This is a string", 5, null], "is a string");
    tf("substr", ["This is a string", 5, "4"], "is a");
    tf("substr", ["This is a string", "5", -5], "is a s");
    tf("substr", ["This is a string", "5", "-15"], "his ");
    tf("substr", ["This is a string", 5, -18], "This ");
    tf("substr", ["This is a string", 0, 25], "This is a string");
    tf("substr", ["This is a string", 1, 25], "his is a string");
    tf("substr", ["This is a string", 16, 0], "");
    tf("substr", ["This is a string", 16, -1], "g");
    tf("substr", ["This is a string", 25], null);
    tf("substr", [["Not a string", void 0]], ["Not a string", void 0]);
    tf("substr", [void 0, "Not an index", 2], void 0);

    tf("uc", ["loWer"], "LOWER");

    t.end();
});

ytest("collection operators", function*(t, ytfm, ytfe, ytf, tfe, tf){

    var a = [3, 4, 5];
    var b = null;
    var c = [];

    var obj = {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {"bar": {"10": "I like cheese"}}
    };
    var obj2 = {"a": 1, "b": 2, "c": 3};
    var assertObjNotMutated = function(){
        t.deepEquals(obj, {
            "colors": "many",
            "pi": [3, 1, 4, 1, 5, 9, 3],
            "foo": {"bar": {"10": "I like cheese"}}
        }, "should not be mutated");
        t.deepEquals(obj2, {"a": 1, "b": 2, "c": 3}, "should not be mutated");
    };

    var fnDontCall = function(){
        throw new Error();
    };

    tf("><", [obj, "many"], false);
    tf("><", [obj, "pi"], true);
    tf("><", [obj, "bar"], false);
    assertObjNotMutated();
    tf("><", [[5, 6, 7], 6], true);
    tf("><", [[5, 6, 7], 2], false);
    tf("><", [[], null], false);
    tf("><", [{}, void 0], false);
    tf("><", [void 0, NaN], true);

    yield ytfm(a, [
        function(x){return x < 10;}, // 1
        function(x){return x >  3;}, // 2
        function(x){return x > 10;}, // 3
        action,                      // 4
    ], [            // 1      2      3      4
        ["all",     true, false, false, false],
        ["notall", false,  true,  true,  true],
        ["any",     true,  true, false, false],
        ["none",   false, false,  true,  true],
    ]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");

    yield ytfm(b, [
        function(x){return stdlib.isnull({}, x);}, // 1
        action,                                    // 2
    ], [            // 1      2
        ["all",     true, false],
        ["notall", false,  true],
        ["any",     true, false],
        ["none",   false,  true],
    ]);

    yield ytfm(c, [
        fnDontCall, // 1
        action,     // 2
    ], [            // 1      2
        ["all",     true,  true],
        ["notall", false, false],
        ["any",    false, false],
        ["none",    true,  true],
    ]);
    t.deepEquals(c, [], "should not be mutated");

    tf("append", [["a", "b"], ["c", "a"]], ["a", "b", "c", "a"]);
    tf("append", [["a", "b"], 10, 11], ["a", "b", 10, 11]);
    tf("append", [10, 11], [10, 11]);
    tf("append", [a, [6]], [3, 4, 5, 6]);
    tf("append", [a, [[]]], [3, 4, 5, []]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("append", [b, []], [null]);
    tf("append", [b], [null]);
    tf("append", [c, []], []);
    tf("append", [c], []);
    tf("append", [c, [[]]], [[]]);
    t.deepEquals(c, [], "should not be mutated");

    var collectFn = function(a){
        return stdlib["<"]({}, a, 5) ? "x" : "y";
    };

    yield ytf("collect", [[7, 4, 3, 5, 2, 1, 6], collectFn], {
        "x": [4,3,2,1],
        "y": [7,5,6]
    });
    yield ytf("collect", [null, collectFn], {"y": [null]});
    yield ytf("collect", [[], fnDontCall], {});
    yield ytf("collect", [[7]], {});
    yield ytf("collect", [[7], action], {});
    //map tests

    yield ytf("filter", [a, function(x){return x < 5;}], [3, 4]);
    yield ytf("filter", [a, function(x){return x > 5;}], []);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    yield ytf("filter", [b, function(x){return stdlib.isnull({}, x);}], [null]);
    yield ytf("filter", [c, fnDontCall], []);
    t.deepEquals(c, [], "should not be mutated");
    yield ytf("filter", [obj2, function(v, k){return v < 3;}], {"a":1,"b":2});
    yield ytf("filter", [obj2, function(v, k){return k === "b";}], {"b":2});
    assertObjNotMutated();
    yield ytf("filter", [b, action], null);

    tf("head", [a], 3);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("head", [[null, {}]], null);
    tf("head", ["string"], "string");
    tf("head", [{"0": null}], {"0": null});
    tf("head", [[]], void 0);

    tf("tail", [a], [4, 5]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("tail", [obj], []);
    assertObjNotMutated();
    tf("tail", ["string"], []);

    tf("index", [a, 5], 2);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("index", [b, NaN], 0);
    tf("index", [obj, "colors"], -1);
    tf("index", [obj2, 2], -1);
    assertObjNotMutated();
    tf("index", [c], -1);
    t.deepEquals(c, [], "should not be mutated");
    tf("index", [[[[0], 0], [0, [0]], [[0], 0], [0, [0]]], [0, [0]]], 1);

    tf("join", [a, ";"], "3;4;5");
    tf("join", [a], "3,4,5", "default to ,");
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("join", [b], "null");
    tf("join", [NaN], "null");
    tf("join", [c, action], "");
    t.deepEquals(c, [], "should not be mutated");
    tf("join", [["<", ">"], /|/], "<re#|#>");

    tf("length", [a], 3);
    tf("length", [[void 0, 7]], 2);
    tf("length", ["\""], 1);
    tf("length", [/'/], 0);
    tf("length", [function(a,b){}], 0);

    yield ytf("map", [a, function(x){return x + 2;}], [5, 6, 7]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    yield ytf("map", [[3, 4, void 0]], [3, 4, void 0]);
    yield ytf("map", [b, function(x){return x + "2";}], ["null2"]);
    yield ytf("map", [action, action], action);
    t.ok(types.isAction(action), "should not be mutated");
    yield ytf("map", [c, fnDontCall], []);
    t.deepEquals(c, [], "should not be mutated");
    yield ytf("map", ["012", function(x){return x + "1";}], ["0121"], "KRL strings are not arrays");

    yield ytf("map", [{}, fnDontCall], {});
    yield ytf("map", [obj2, function(v, k){return v + k;}], {"a":"1a", "b":"2b","c":"3c"});
    assertObjNotMutated();

    yield ytf("pairwise", [[a, [6, 7, 8]], function(x, y){return x + y;}], [9, 11, 13]);
    yield ytf("pairwise", [[a, "abcdef".split("")], function(x, y){
        return stdlib["+"]({}, x, y);
    }], [
        "3a",
        "4b",
        "5c",
        "nulld",
        "nulle",
        "nullf",
    ]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    yield ytf("pairwise", [[[], []], fnDontCall], []);
    yield ytf("pairwise", [[[], 1], function(l, r){return [l, r];}], [[void 0, 1]]);

    yield ytfe("pairwise", [{}, fnDontCall], "TypeError");
    yield ytfe("pairwise", [[[]], fnDontCall], "TypeError");
    yield ytfe("pairwise", [[[], []]], "Error");
    yield ytfe("pairwise", [[[], []], action], "TypeError");

    yield ytf("reduce", [a, function(a,b){return a+b;}], 12);
    yield ytf("reduce", [a, function(a,b){return a+b;}, 10], 22);
    yield ytf("reduce", [a, function(a,b){return a-b;}], -6);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    yield ytf("reduce", [[], fnDontCall], 0);
    yield ytf("reduce", [[], fnDontCall, void 0], void 0);
    yield ytf("reduce", [76, fnDontCall], 76);
    yield ytf("reduce", [null, function(a,b){return a+b;}, "76"], "76null");

    tf("reverse", [a], [5, 4, 3]);
    t.deepEquals(a, [3, 4, 5], "should not be mutated");
    tf("reverse", ["not an array"], "not an array");

    var veggies = ["corn","tomato","tomato","tomato","sprouts","lettuce","sprouts"];
    tf("slice", [veggies, 1, 4], ["tomato","tomato","tomato","sprouts"]);
    tf("slice", [veggies, 2, 0], ["corn","tomato","tomato"]);
    tf("slice", [veggies, 2], ["corn","tomato","tomato"]);
    tf("slice", [veggies, 0, 0], ["corn"]);
    tf("slice", [{"0": "0"}, 0, 0], [{"0": "0"}]);
    tf("slice", [[], _.noop], null, "error", "Error");
    tfe("slice", [veggies, _.noop], "TypeError");
    tfe("slice", [veggies, 1, _.noop], "TypeError");
    tfe("slice", [veggies, -1, _.noop], "TypeError");
    tf("slice", [veggies, 14], null, "error", "RangeError");
    tf("slice", [veggies, 2, -1], null, "error", "RangeError");
    t.deepEquals(veggies, ["corn","tomato","tomato","tomato","sprouts","lettuce","sprouts"], "should not be mutated");

    tf("splice", [veggies, 1, 4], ["corn","lettuce","sprouts"]);
    tf("splice", [veggies, 2, 0, ["corn", "tomato"]], ["corn","tomato","corn","tomato","tomato","tomato","sprouts","lettuce","sprouts"]);
    tf("splice", [veggies, 2, 0, "liver"], ["corn","tomato","liver","tomato","tomato","sprouts","lettuce","sprouts"]);
    tf("splice", [veggies, 2, 2, "liver"], ["corn","tomato","liver","sprouts","lettuce","sprouts"]);
    tf("splice", [veggies, 1, 10], ["corn"]);
    tf("splice", [veggies, 1, 10, "liver"], ["corn", "liver"]);
    tf("splice", [veggies, 1, 10, []], ["corn"]);
    tfe("splice", [[], NaN], "Error");
    tfe("splice", [void 0, NaN, []], "TypeError");
    tfe("splice", [void 0, -1, []], "RangeError");
    tfe("splice", [veggies, 7, []], "RangeError");
    tfe("splice", [veggies, 6, []], "TypeError");
    tf("splice", [void 0, 0, 0, []], [void 0]);
    t.deepEquals(veggies, ["corn","tomato","tomato","tomato","sprouts","lettuce","sprouts"], "should not be mutated");

    var to_sort = [5, 3, 4, 1, 12];
    yield ytf("sort", [null, "numeric"], null);
    yield ytf("sort", [to_sort], [1, 12, 3, 4, 5]);
    yield ytf("sort", [to_sort, action], [1, 12, 3, 4, 5]);
    yield ytf("sort", [to_sort, "default"], [1, 12, 3, 4, 5]);
    yield ytf("sort", [to_sort, "reverse"], [5, 4, 3, 12, 1]);
    yield ytf("sort", [to_sort, "numeric"], [1, 3, 4, 5, 12]);
    yield ytf("sort", [to_sort, "ciremun"], [12, 5, 4, 3, 1]);
    yield ytf("sort", [to_sort, function(a, b){
        return a < b ? -1 : (a === b ? 0 : 1);
    }], [1, 3, 4, 5, 12]);
    t.deepEquals(to_sort, [5, 3, 4, 1, 12], "should not be mutated");

    tf("delete", [obj, ["foo", "bar", 10]], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {"bar": {}}
    });
    assertObjNotMutated();
    tf("delete", [{"0": void 0}, "1"], {"0": void 0});

    tf("encode", [{blah: 1}], "{\"blah\":1}");
    tf("encode", [[1, 2]], "[1,2]");
    tf("encode", [12], "12");
    tf("encode", ["12"], "\"12\"");
    //all nulls are treated the same
    tf("encode", [null], "null");
    tf("encode", [NaN], "null");
    tf("encode", [void 0], "null");
    //use .as("String") rules for other types
    tf("encode", [action], "\"[Action]\"");
    tf("encode", [/a/ig], "\"re#a#gi\"");
    (function(){
        tf("encode", [arguments], "{\"0\":\"a\",\"1\":\"b\"}");
    }("a", "b"));
    //testing it nested
    tf("encode", [{fn: _.noop, n: NaN, u: void 0}], "{\"fn\":\"[Function]\",\"n\":null,\"u\":null}");

    //testing indent options
    tf("encode", [{a: 1, b: 2}, 0], "{\"a\":1,\"b\":2}");
    tf("encode", [{a: 1, b: 2}, 4], "{\n    \"a\": 1,\n    \"b\": 2\n}");
    tf("encode", [{a: 1, b: 2}, "2"], "{\n  \"a\": 1,\n  \"b\": 2\n}");
    tf("encode", [{a: 1, b: 2}, null], "{\"a\":1,\"b\":2}", "default indent to 0");
    tf("encode", [{a: 1, b: 2}, arguments], "{\"a\":1,\"b\":2}", "default indent to 0");
    tf("encode", [{a: 1, b: 2}, _.noop], "{\"a\":1,\"b\":2}", "default indent to 0");

    tf("keys", [obj], ["colors", "pi", "foo"]);
    tf("keys", [obj, ["foo", "bar"]], ["10"]);
    tf("keys", [obj, ["pi"]], ["0", "1", "2", "3", "4", "5", "6"]);
    tf("keys", [obj, ["foo", "not"]], [], "bad path");
    assertObjNotMutated();
    tf("keys", [["wat", {da: "heck"}]], ["0", "1"]);
    tf("keys", [null], [], "not a map or array");
    tf("keys", [_.noop], [], "not a map or array");
    tf("keys", [{a: "b"}, "not-found"], [], "bad path");

    tf("values", [obj], [
        "many",
        [3, 1, 4, 1, 5, 9, 3],
        {"bar": {"10": "I like cheese"}}
    ]);
    tf("values", [obj, ["foo", "bar"]], ["I like cheese"]);
    tf("values", [obj, ["pi"]], [3, 1, 4, 1, 5, 9, 3]);
    tf("values", [obj, ["foo", "not"]], []);
    assertObjNotMutated();
    tf("values", [["an", "array"]], ["an", "array"]);
    tf("values", [void 0], [], "not a map or array");
    tf("values", [_.noop], [], "not a map or array");

    tf("put", [{key: 5}, {foo: "bar"}], {key: 5, foo: "bar"});
    tf("put", [{key: 5}, [], {foo: "bar"}], {key: 5, foo: "bar"});
    tf("put", [{key: 5}, ["baz"], {foo: "bar"}], {key: 5, baz: {foo: "bar"}});
    tf("put", [{key: 5}, ["qux"], "wat?"], {key: 5, qux: "wat?"});
    tf("put", [{key: 5}, [null], "wat?"], {key: 5, "null": "wat?"});
    tf("put", [{key: 5}, [void 0], "wat?"], {key: 5, "null": "wat?"});
    tf("put", [{key: 5}, [void 0], "wat?"], {key: 5, "null": "wat?"});
    tf("put", [{key: 5}, [NaN], "wat?"], {key: 5, "null": "wat?"});
    tf("put", [{key: 5}, [_.noop], "wat?"], {key: 5, "[Function]": "wat?"});

    tf("put", [obj, ["foo"], {baz: "qux"}], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {"baz": "qux"},
    }, "overwrite at the path, even if to_set and curr val are both maps");
    tf("put", [obj, ["foo", "bar", 11], "wat?"], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {
                "10": "I like cheese",
                "11": "wat?",
            },
        }
    });
    tf("put", [obj, ["foo", "bar", 10], "no cheese"], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {"10": "no cheese"},
        }
    });
    tf("put", [obj, {flop: 12}], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {"bar": {"10": "I like cheese"}},
        "flop": 12
    });
    assertObjNotMutated();
    tf("put", [{}, ["key1"], "value2"], {key1: "value2"});
    tf("put", [{}, [], {key2: "value3"}], {key2: "value3"});
    tf("put", [{key: 5}, "foo", {key2: "value3"}], {key: 5, "foo": {key2: "value3"}});
    tf("put", [{key: 5}, "key", 7], {key: 7});
    tf("put", [{key: 5}, ["key"], 9], {key: 9});

    tf("put", [5, ["key"], 9], 5, "if val is not a Map or Array, return the val");
    tf("put", ["wat", ["key"], 9], "wat", "if val is not a Map or Array, return the val");
    tf("put", [null, ["key"], 9], null, "if val is not a Map or Array, return the val");
    tf("put", [{a: null, b:void 0}], {a: null, b: void 0}, "if no arguments, return the val");

    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {}, ["0", "0"], "foo")),
        "{\"0\":{\"0\":\"foo\"}}",
        "don't use arrays by default, i.e. don't do {\"0\":[\"foo\"]}"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {}, [0, 1], "foo")),
        "{\"0\":{\"1\":\"foo\"}}",
        "don't do {\"0\":[null,\"foo\"]}"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, [], [0, 0], "foo")),
        "[{\"0\":\"foo\"}]"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, [["wat?"]], [0, 0], "foo")),
        "[[\"foo\"]]",
        "if the nested value is an array, keep it an array"
    );

    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {}, ["a", "b"], [])),
        "{\"a\":{\"b\":[]}}",
        "preserve type of to_set"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, [], [0], ["foo"])),
        "[[\"foo\"]]",
        "preserve type of to_set"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, [], [], ["foo"])),
        "[\"foo\"]",
        "preserve type of to_set"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {}, "foo", [0])),
        "{\"foo\":[0]}",
        "preserve type of to_set"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {}, "foo", ["bar"])),
        "{\"foo\":[\"bar\"]}",
        "preserve type of to_set"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, [{foo: 1}, {bar: 2}], [1, "bar", "baz"], 4)),
        "[{\"foo\":1},{\"bar\":{\"baz\":4}}]"
    );

    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", 1], 4)),
        "{\"one\":[2,4]}",
        "number index"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", "1"], 4)),
        "{\"one\":[2,4]}",
        "Array index can be a string"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", "2"], 4)),
        "{\"one\":[2,3,4]}",
        "Array index at the end"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", "3"], 4)),
        "{\"one\":{\"0\":2,\"1\":3,\"3\":4}}",
        "convert Array to Map if sparse array is attempted"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", "foo"], 4)),
        "{\"one\":{\"0\":2,\"1\":3,\"foo\":4}}",
        "convert Array to Map if non-index path is given"
    );
    t.equals(
        JSON.stringify(stdlib["put"](defaultCTX, {one: [2, 3]}, ["one", "foo", "0"], 4)),
        "{\"one\":{\"0\":2,\"1\":3,\"foo\":{\"0\":4}}}",
        "convert Array to Map if non-index path is given"
    );

    tf("get", [obj, ["foo", "bar", "10"]], "I like cheese");
    tf("get", [obj, "colors"], "many");
    tf("get", [obj, ["pi", 2]], 4);
    assertObjNotMutated();
    tf("get", [["a", "b", {"c": ["d", "e"]}], [2, "c", 1]], "e", "get works on arrays and objects equally");
    tf("get", [["a", "b", {"c": ["d", "e"]}], ["2", "c", "1"]], "e", "array indices can be strings");

    tf("set", [obj, ["foo", "baz"], "qux"], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {"10": "I like cheese"},
            "baz": "qux"
        }
    });
    tf("set", [obj, "flop", 12], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {"10": "I like cheese"}
        },
        "flop": 12
    });
    tf("set", [obj, "colors", ["R", "G", "B"]], {
        "colors": ["R", "G", "B"],
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {"10": "I like cheese"}
        }
    });
    tf("set", [obj, ["foo", "bar", "10"], "modified a sub object"], {
        "colors": "many",
        "pi": [3, 1, 4, 1, 5, 9, 3],
        "foo": {
            "bar": {"10": "modified a sub object"}
        }
    });
    tf("set", [obj, ["pi", 4, "a"], "wat?"], {
        "colors": "many",
        "pi": [3, 1, 4, 1, {a: "wat?"}, 9, 3],
        "foo": {"bar": {"10": "I like cheese"}}
    });
    assertObjNotMutated();

    tf("set", [["a", "b", "c"], [1], "wat?"], ["a", "wat?", "c"]);
    tf("set", [["a", "b", "c"], ["1"], "wat?"], ["a", "wat?", "c"]);
    tf("set", [[{a: [{b: 1}]}], [0, "a", 0, "b"], "wat?"], [{a: [{b: "wat?"}]}]);

    tf("intersection", [[[2], 2, 1, null], [[2], "1", 2, void 0]], [[2], 2, null]);
    tf("intersection", [[[0], {}], [[1], []]], []);
    tf("intersection", [[]], []);
    tf("intersection", [[{}]], []);
    tf("intersection", [{}, [{}]], [{}]);

    tf("union", [[2], [1, 2]], [2, 1]);
    tf("union", [[1, 2], [1, 4]], [1, 2, 4]);
    tf("union", [[{"x":2}], [{"x":1}]], [{"x":2}, {"x":1}]);
    tf("union", [[]], []);
    tf("union", [[], {"x":1}], [{"x":1}]);
    tf("union", [{"x":1}, []], [{"x":1}]);
    tf("union", [{"x":1}], {"x":1});

    tf("difference", [[2, 1], [2, 3]], [1]);
    tf("difference", [[2, 1], 2], [1]);
    tf("difference", [[{"x":2}, {"x":1}], [{"x":2}, {"x":3}]], [{"x":1}]);
    tf("difference", [{"x":null}, []], [{"x":null}]);
    tf("difference", [{"x":null}], {"x":null});

    tf("has", [[1, 2, 3, 4], [4, 2]], true);
    tf("has", [[1, 2, 3, 4], [4, 5]], false);
    tf("has", [[[null, [action]]], [[void 0, [action]]]], true);
    tf("has", [[], []], true);
    tf("has", [[]], true);

    tf("once", [[1, 2, 1, 3, 4, 4]], [2, 3]);
    tf("once", [{"a": void 0}], {"a": void 0});
    tf("once", [[1, NaN, "a"]], [1, null, "a"]);

    tf("duplicates", [[1, 2, 1, 3, 4, 4]], [1, 4]);
    tf("duplicates", [{"0":1, "1":1}], []);
    tf("duplicates", [[1, 3, null, NaN, void 0, 3]], [3, null]);

    tf("unique", [[1, 2, 1, [3], [4], [4]]], [1, 2, [3], [4]]);
    tf("unique", [{"0":1, "1":1}], {"0":1, "1":1});
});

test("klog", function(t){
    t.plan(4);
    var val = 42;
    t.equals(stdlib.klog({
        emit: function(kind, obj){
            t.equals(kind, "klog");
            t.equals(obj.val, 42);
            t.equals(obj.message, "message 1");
        }
    }, val, "message 1"), val);
});

test("defaultsTo - testing debug logging", function(t){

    var messages = [];

    var ctx = {
        emit: function(kind, message){
            t.equals(kind, "debug");

            messages.push(message);
        }
    };

    t.equals(stdlib.defaultsTo(ctx, null, 42), 42, "no message to log");
    t.ok(_.isNaN(stdlib.defaultsTo(ctx, null, NaN, "message 1")), "should emit debug");
    t.equals(stdlib.defaultsTo(ctx, null, 42, _.noop), 42, "message should use KRL toString rules");
    t.equals(stdlib.defaultsTo(ctx, null, 42, NaN), 42, "no message to log");
    t.deepEqual(stdlib.defaultsTo(ctx, [void 0]), [void 0]);
    testFnErr(t, "defaultsTo", [null], "Error");

    t.deepEqual(messages, [
        "[DEFAULTSTO] message 1",
        "[DEFAULTSTO] [Function]",//message should use KRL toString rules
    ]);

    t.end();
});
