"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "_rsc_lib_env_ts";
exports.ids = ["_rsc_lib_env_ts"];
exports.modules = {

/***/ "(rsc)/./lib/env.ts":
/*!********************!*\
  !*** ./lib/env.ts ***!
  \********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   REQUIRED_FIREBASE_KEYS: () => (/* binding */ REQUIRED_FIREBASE_KEYS),\n/* harmony export */   getMissingFirebaseEnv: () => (/* binding */ getMissingFirebaseEnv),\n/* harmony export */   readPublicEnv: () => (/* binding */ readPublicEnv)\n/* harmony export */ });\nconst REQUIRED_FIREBASE_KEYS = [\n    'NEXT_PUBLIC_FIREBASE_API_KEY',\n    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',\n    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',\n    'NEXT_PUBLIC_FIREBASE_APP_ID',\n    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',\n    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'\n];\nfunction readPublicEnv(env = process.env) {\n    return Object.fromEntries(REQUIRED_FIREBASE_KEYS.map((key)=>[\n            key,\n            env[key]\n        ]));\n}\nfunction getMissingFirebaseEnv(env = process.env) {\n    const publicEnv = readPublicEnv(env);\n    return REQUIRED_FIREBASE_KEYS.filter((key)=>!publicEnv[key]);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9saWIvZW52LnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUFPLE1BQU1BLHlCQUF5QjtJQUNwQztJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7Q0FDRCxDQUFVO0FBTUosU0FBU0MsY0FDZEMsTUFBMENDLFFBQVFELEdBQUc7SUFFckQsT0FBT0UsT0FBT0MsV0FBVyxDQUN2QkwsdUJBQXVCTSxHQUFHLENBQUMsQ0FBQ0MsTUFBUTtZQUFDQTtZQUFLTCxHQUFHLENBQUNLLElBQUk7U0FBQztBQUV2RDtBQUVPLFNBQVNDLHNCQUNkTixNQUEwQ0MsUUFBUUQsR0FBRztJQUVyRCxNQUFNTyxZQUFZUixjQUFjQztJQUNoQyxPQUFPRix1QkFBdUJVLE1BQU0sQ0FBQyxDQUFDSCxNQUFRLENBQUNFLFNBQVMsQ0FBQ0YsSUFBSTtBQUMvRCIsInNvdXJjZXMiOlsiQzpcXHRoZXNhcmFfUm9sbEJhY2tcXGFwcHNcXHdlYlxcbGliXFxlbnYudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IFJFUVVJUkVEX0ZJUkVCQVNFX0tFWVMgPSBbXHJcbiAgJ05FWFRfUFVCTElDX0ZJUkVCQVNFX0FQSV9LRVknLFxyXG4gICdORVhUX1BVQkxJQ19GSVJFQkFTRV9BVVRIX0RPTUFJTicsXHJcbiAgJ05FWFRfUFVCTElDX0ZJUkVCQVNFX1BST0pFQ1RfSUQnLFxyXG4gICdORVhUX1BVQkxJQ19GSVJFQkFTRV9BUFBfSUQnLFxyXG4gICdORVhUX1BVQkxJQ19GSVJFQkFTRV9TVE9SQUdFX0JVQ0tFVCcsXHJcbiAgJ05FWFRfUFVCTElDX0ZJUkVCQVNFX01FU1NBR0lOR19TRU5ERVJfSUQnLFxyXG5dIGFzIGNvbnN0O1xyXG5cclxuZXhwb3J0IHR5cGUgRmlyZWJhc2VLZXkgPSAodHlwZW9mIFJFUVVJUkVEX0ZJUkVCQVNFX0tFWVMpW251bWJlcl07XHJcblxyXG5leHBvcnQgdHlwZSBGaXJlYmFzZUVudiA9IFJlY29yZDxGaXJlYmFzZUtleSwgc3RyaW5nIHwgdW5kZWZpbmVkPjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZWFkUHVibGljRW52KFxyXG4gIGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IHByb2Nlc3MuZW52LFxyXG4pOiBGaXJlYmFzZUVudiB7XHJcbiAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhcclxuICAgIFJFUVVJUkVEX0ZJUkVCQVNFX0tFWVMubWFwKChrZXkpID0+IFtrZXksIGVudltrZXldXSksXHJcbiAgKSBhcyBGaXJlYmFzZUVudjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldE1pc3NpbmdGaXJlYmFzZUVudihcclxuICBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gPSBwcm9jZXNzLmVudixcclxuKTogRmlyZWJhc2VLZXlbXSB7XHJcbiAgY29uc3QgcHVibGljRW52ID0gcmVhZFB1YmxpY0VudihlbnYpO1xyXG4gIHJldHVybiBSRVFVSVJFRF9GSVJFQkFTRV9LRVlTLmZpbHRlcigoa2V5KSA9PiAhcHVibGljRW52W2tleV0pO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJSRVFVSVJFRF9GSVJFQkFTRV9LRVlTIiwicmVhZFB1YmxpY0VudiIsImVudiIsInByb2Nlc3MiLCJPYmplY3QiLCJmcm9tRW50cmllcyIsIm1hcCIsImtleSIsImdldE1pc3NpbmdGaXJlYmFzZUVudiIsInB1YmxpY0VudiIsImZpbHRlciJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./lib/env.ts\n");

/***/ })

};
;