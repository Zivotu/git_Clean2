export function playHtmlTemplate(title: string, buildId?: string) {
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />",
    `  <title>${title}</title>`,
    "  <link rel=\"stylesheet\" href=\"./styles.css\" />",
    // Polyfills and sandbox safety for iframe environments
    "  <script>\n    // crypto.randomUUID polyfill for non-secure or older contexts\n    (function(){try{if(!('crypto'in window)){Object.defineProperty(window,'crypto',{value:{},configurable:true});}\n    var c=window.crypto; if(!c.randomUUID){var rng=function(){return (Math.random()*16)|0};\n    var uuid=function(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(ch){var r=rng();var v=ch==='x'?r:((r&0x3)|0x8);return v.toString(16)})};\n    Object.defineProperty(c,'randomUUID',{value:uuid,configurable:false});}}catch(e){}})();\n  </script>",
    "  <script>\n    // Global sandbox form-submit prevention + novalidate tagging\n    (function(){\n      function init(){\n        // Prevent native form submissions that would be blocked by sandbox (no allow-forms)\n        document.addEventListener('submit',function(e){try{e.preventDefault();e.stopPropagation();}catch{}},true);\n        // Ensure forms are marked novalidate to avoid built-in validation bubbles\n        try{\n          var apply=function(root){var forms=(root||document).getElementsByTagName('form');for(var i=0;i<forms.length;i++){forms[i].setAttribute('novalidate','');}};\n          if(document.readyState!=='loading') apply(document);\n          var mo=new MutationObserver(function(ms){for(var j=0;j<ms.length;j++){var m=ms[j];for(var k=0;k<m.addedNodes.length;k++){var n=m.addedNodes[k];if(n&&n.nodeType===1){apply(n);}}}});\n          mo.observe(document.documentElement,{childList:true,subtree:true});\n        }catch{}\n      }\n      if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);} else {init();}\n    })();\n  </script>",
    "</head>",
    "<body class=\"dark\">",
    "  <div id=\"root\"></div>",
    "  <script type=\"module\" src=\"./__name-shim.js\"></script>",
    "  <script type=\"module\" src=\"./bootstrap.js\"></script>",
    process.env.DEV_ADMIN_HTML === '1' && buildId
      ? `  <a href=\"/admin?buildId=${buildId}\">Admin Review</a>`
      : "",
    "</body>",
    "</html>",
  ].join("\n");
}
