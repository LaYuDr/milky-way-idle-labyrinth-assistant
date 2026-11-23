(function (root) {
  "use strict";
  // Shared visual vocabulary. Game cells and native editing controls keep their own styles.
  const css = `
/* Guild assistant's construction/trials palette, scoped to assistant-owned surfaces. */
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"],.mwi-labyrinth-auto-table,.mwi-labyrinth-calc-prefill-toggle){
 --ml-surface:#24273b;--ml-inset:#191c2e;--ml-header:#202139;--ml-raised:#2c3047;
 --ml-hover:#34394f;--ml-hover-active:#454e68;--ml-line:#41465f;--ml-field-line:#626b86;
 --ml-text:#edf0fa;--ml-muted:#b7bfd4;--ml-accent:#91dfcb;--ml-action:#43c4ad;--ml-action-text:#10201f;
 --ml-action-hover:#75dbc6;--ml-good:#91dfcb;--ml-warn:#e9c487;--ml-danger:#ffa7b5;
 --ml-radius:6px;--ml-control-radius:4px;
 color:var(--ml-text);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
 font-variant-numeric:tabular-nums;line-height:1.45;color-scheme:dark;
}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) [hidden]{display:none!important;}
:is(#mwi-labyrinth-planner,#mwi-labyrinth-calc-auto-estimate-control,#mwi-labyrinth-calc-clear-rate-preview,#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating){box-sizing:border-box;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) :is(button,input,select){font:inherit;box-sizing:border-box;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) :is(button,select,summary){cursor:pointer;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"],.mwi-labyrinth-calc-prefill-toggle) :focus-visible{outline:2px solid var(--ml-accent);outline-offset:2px;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) ::selection{background:#34685e;color:#fff;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"],.mwi-labyrinth-calc-prefill-toggle) input{accent-color:var(--ml-action);caret-color:var(--ml-accent);}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) :is(input[type="number"],select){height:34px;min-width:0;max-width:100%;padding:5px 8px;border:1px solid var(--ml-field-line);border-radius:var(--ml-control-radius);background:var(--ml-inset);color:var(--ml-text);font-size:13px;line-height:1.4;}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) input:invalid{border-color:var(--ml-danger);}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) input::placeholder{color:var(--ml-muted);opacity:1;}
:is(#mwi-labyrinth-planner,#mwi-labyrinth-calc-auto-estimate-control,#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button{min-height:32px;height:auto;padding:6px 10px;border:1px solid var(--ml-line);border-radius:var(--ml-control-radius);background:var(--ml-hover);color:var(--ml-text);font-size:12px;font-weight:600;line-height:1.4;white-space:normal;box-shadow:none;transition:background-color .15s ease,border-color .15s ease;}
:is(#mwi-labyrinth-planner,#mwi-labyrinth-calc-auto-estimate-control,#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button:hover:not(:disabled){background:var(--ml-hover-active);border-color:var(--ml-field-line);}
:is(#mwi-labyrinth-planner,#mwi-labyrinth-calc-auto-estimate-control,#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button:active:not(:disabled){background:var(--ml-inset);}
:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) :is(button,input,select):disabled{opacity:.55;cursor:default;}
:is(#mwi-labyrinth-planner,#mwi-labyrinth-calc-auto-estimate-control) button:disabled{cursor:wait;}
#mwi-labyrinth-planner *{box-sizing:border-box;}
/* User-approved reference: compact header, route/beacon cards and three actions. */
#mwi-labyrinth-planner{width:270px;padding:0;background:#24273b;border:1px solid #41465f;border-radius:6px;font-size:12px;box-shadow:none;}
.mwi-labyrinth-map-group > #mwi-labyrinth-planner{flex-basis:270px;width:270px;}
#mwi-labyrinth-planner .mwi-lab-launcher{display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;padding:10px;border:0;background:transparent;height:42px;min-height:42px;cursor:default;}
#mwi-labyrinth-planner .mwi-lab-launcher strong{font-size:14px;font-weight:700;color:#fff;}
#mwi-labyrinth-planner .mwi-lab-content{padding:0 10px 10px;max-height:none;overflow:visible;display:flex;flex-direction:column;gap:12px;}
#mwi-labyrinth-planner .mwi-lab-route-section{display:flex;flex-direction:column;gap:10px;}
#mwi-labyrinth-planner .mwi-lab-card{background:#171928;border:1px solid #30344d;border-radius:8px;padding:8px;box-sizing:border-box;}
#mwi-labyrinth-planner .mwi-lab-route-card{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:45px;padding:7px 8px;}
#mwi-labyrinth-planner .mwi-lab-segmented{display:flex;align-items:center;background:#24283f;border-radius:6px;padding:2px;gap:0;}
#mwi-labyrinth-planner .mwi-lab-pill-toggle{position:relative;display:flex;align-items:center;cursor:pointer;margin:0;padding:4px 10px;line-height:16px;border-radius:4px;font-size:12px;font-weight:600;color:#9da6be;white-space:nowrap;}
#mwi-labyrinth-planner .mwi-lab-pill-toggle input,#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;}
#mwi-labyrinth-planner .mwi-lab-pill-toggle:focus-within,#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle:focus-within{outline:2px solid var(--ml-accent);outline-offset:2px;}
#mwi-labyrinth-planner .mwi-lab-pill-toggle[data-checked="true"]{background:#43c4ad;color:#10201f;}
#mwi-labyrinth-planner .mwi-lab-floor-toggle{border:0;background:transparent;padding:4px 8px;border-radius:4px;font-size:12px;color:#9da6be;font-weight:500;min-height:0;line-height:16px;}
#mwi-labyrinth-planner .mwi-lab-floor-toggle[data-active="true"]{color:#edf0fa;background:#343b55;}
#mwi-labyrinth-planner .mwi-lab-floor-setting{display:flex;align-items:center;gap:5px;font-size:12px;color:#9da6be;margin:0;white-space:nowrap;}
#mwi-labyrinth-planner .mwi-lab-route-card label{margin:0;}
#mwi-labyrinth-planner .mwi-lab-floor-setting input{appearance:textfield;width:40px;height:24px;text-align:center;font-size:13px;font-weight:700;background:#24283f;border:1px solid #383d5d;border-radius:4px;padding:0;}
#mwi-labyrinth-planner input::-webkit-inner-spin-button{appearance:none;}
#mwi-labyrinth-planner .mwi-lab-display-error{color:var(--ml-danger);font-size:11px;margin:0;}
#mwi-labyrinth-planner .mwi-lab-muted{color:var(--ml-muted);font-size:11px;margin:0;}
#mwi-labyrinth-planner .mwi-lab-route-section p:empty{display:none;}
#mwi-labyrinth-planner .mwi-lab-map-zoom{display:flex;align-items:center;background:#171928;border:1px solid #343852;border-radius:20px;padding:1px 3px;height:23px;gap:0;margin:0;}
#mwi-labyrinth-planner .mwi-lab-zoom-label{display:none;}
#mwi-labyrinth-planner .mwi-lab-map-zoom button{background:transparent;border:0;border-radius:12px;color:#9da6be;font-size:12px;height:19px;line-height:19px;padding:0 3px;min-width:17px;min-height:0;}
#mwi-labyrinth-planner .mwi-lab-map-zoom button:nth-of-type(2){font-weight:500;color:#cbd5e1;min-width:40px;padding:0;}
#mwi-labyrinth-planner .mwi-lab-beacons{margin:0;padding:0;border:0;}
#mwi-labyrinth-planner .mwi-lab-beacon-card{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:55px;}
#mwi-labyrinth-planner .mwi-lab-beacon-info{display:flex;flex-direction:column;gap:4px;min-width:0;}
#mwi-labyrinth-planner .mwi-lab-beacons header{display:flex;align-items:center;justify-content:flex-start;gap:6px;margin:0;}
#mwi-labyrinth-planner .mwi-lab-beacons header strong{font-size:12px;font-weight:650;color:#edf0fa;}
#mwi-labyrinth-planner .mwi-lab-beacons header small{font-size:11px;font-weight:500;color:#e9c487;background:#483c30;padding:1px 4px;border-radius:3px;line-height:1.3;}
#mwi-labyrinth-planner .mwi-lab-beacon-info .mwi-lab-beacon-preview{font-size:12px;font-weight:650;color:#91dfcb;margin:0;line-height:1.3;}
#mwi-labyrinth-planner .mwi-lab-beacon-actions{display:flex;align-items:center;margin:0;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper{display:flex;align-items:center;background:#24283f;border:1px solid #383d5d;border-radius:4px;height:28px;overflow:hidden;gap:0;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper button{border:0;background:transparent;color:#cbd5e1;font-size:13px;font-weight:500;padding:0;width:22px;min-width:22px;height:26px;min-height:0;}
#mwi-labyrinth-planner input.mwi-lab-beacon-quantity{width:26px;height:26px;border:0;background:transparent;color:#fff;font-size:13px;font-weight:700;text-align:center;padding:0;appearance:textfield;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper[data-unlocked="true"]{border-color:#e9c487;}
#mwi-labyrinth-planner .mwi-lab-beacon-quantity[data-overstock="true"]{color:#e9c487;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper button[data-limit="true"]{background:#483c30;color:#e9c487;}
#mwi-labyrinth-planner #mwi-labyrinth-calc-dock{border:0;margin:0;padding:0;}
#mwi-labyrinth-calc-clear-rate-control{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;width:100%;padding:0;border:0;background:transparent;box-shadow:none;}
#mwi-labyrinth-planner .mwi-lab-calculate-action{position:relative;grid-column:1/-1;height:32px;}
#mwi-labyrinth-planner .mwi-lab-calculate-action>button{position:absolute;inset:0;width:100%;height:32px;min-height:32px;border:0;border-radius:8px;background:#43c4ad;color:#10201f;font-size:12px;font-weight:700;text-align:left;padding:0 0 0 calc(50% - 50px);}
#mwi-labyrinth-planner .mwi-lab-calculate-action>button:hover:not(:disabled){background:#75dbc6;}
#mwi-labyrinth-planner .mwi-lab-calculate-action .mwi-labyrinth-calc-clear-rate-control__settings{position:absolute;left:calc(50% + 8px);top:8px;display:flex;align-items:center;gap:0;margin:0;padding:0 4px;height:16px;border-radius:3px;background:transparent;color:#214d45;font-weight:400;}
#mwi-labyrinth-planner .mwi-lab-calculate-action .mwi-labyrinth-calc-clear-rate-control__settings-label{display:none;}
#mwi-labyrinth-planner .mwi-lab-calculate-action input[type="number"]{width:28px;min-height:0;height:16px;border:0;border-radius:0;background:transparent;padding:0;color:inherit;font-size:10px;font-weight:400;text-align:right;appearance:textfield;}
#mwi-labyrinth-planner .mwi-lab-calculate-action .mwi-labyrinth-calc-clear-rate-control__settings-unit{font-size:10px;font-weight:400;line-height:16px;}
#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__log-toggle,#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle{position:relative;display:flex;align-items:center;justify-content:center;margin:0;min-height:28px;height:28px;border-radius:6px;background:#24283f;border:1px solid transparent;color:#cbd5e1;font-size:12px;font-weight:600;padding:0 6px;}
#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle:hover:not(:has(:disabled)){background:var(--ml-hover-active);border-color:var(--ml-field-line);}
#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle:active:not(:has(:disabled)){background:var(--ml-inset);}
#mwi-labyrinth-planner .mwi-labyrinth-calc-clear-rate-control__distribution-toggle:has(:disabled){opacity:.55;cursor:default;}
#mwi-labyrinth-planner .mwi-labyrinth-calc-options{grid-column:1/-1;border:0;padding:0;margin:0;}
#mwi-labyrinth-planner .mwi-labyrinth-calc-options:empty{display:none;}
#mwi-labyrinth-calc-clear-rate-control>.mwi-labyrinth-calc-clear-rate-control__progress{grid-column:1/-1;width:100%;margin:0;display:flex;flex-direction:column;gap:3px;}
#mwi-labyrinth-calc-clear-rate-control .mwi-labyrinth-calc-clear-rate-control__track{height:3px;background:var(--ml-inset);border-radius:2px;}
#mwi-labyrinth-calc-clear-rate-control .mwi-labyrinth-calc-clear-rate-control__bar{background:var(--ml-action);}
#mwi-labyrinth-calc-clear-rate-control .mwi-labyrinth-calc-clear-rate-control__text{font-size:11px;color:var(--ml-muted);}
/* Recommendation controls respond to their host width, including a narrow desktop sidebar. */
#mwi-labyrinth-calc-auto-estimate-control{container-type:inline-size;container-name:mwi-lab-recommend;min-width:0;width:100%;max-width:920px;display:grid;grid-template-columns:minmax(0,1fr);gap:0;padding:0;margin:0 0 10px;border:0;border-radius:0;background:transparent;box-shadow:none;font-size:13px;}
.mwi-labyrinth-calc-auto-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;padding:6px 0;background:transparent;border-bottom:1px solid var(--ml-line);border-radius:0;}
.mwi-labyrinth-calc-auto-heading h3{font-size:14px;margin:0;font-weight:650;}
.mwi-labyrinth-calc-auto-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;min-width:0;}
#mwi-labyrinth-calc-auto-estimate-control .mwi-labyrinth-calc-auto-budget{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ml-muted);}
#mwi-labyrinth-calc-auto-estimate-control .mwi-labyrinth-calc-auto-budget input{width:64px;}
.mwi-labyrinth-calc-auto-toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 20px;padding:8px 0;background:transparent;}
.mwi-labyrinth-calc-auto-method{display:flex;align-items:center;gap:6px;min-width:0;}
.mwi-labyrinth-calc-auto-target{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:6px;min-width:0;flex:1;}
.mwi-labyrinth-calc-auto-toolbar .mwi-labyrinth-calc-auto-target>span{font-size:12px;color:var(--ml-muted);}
.mwi-labyrinth-calc-auto-toolbar input[type="number"]{width:64px;flex:0 0 64px;text-align:right;}
#mwi-labyrinth-calc-auto-estimate-control .mwi-labyrinth-calc-auto-primary{min-height:28px;min-width:96px;}
#mwi-labyrinth-calc-auto-estimate-control .mwi-labyrinth-calc-auto-status{margin:0;padding:6px 0;border-top:1px solid var(--ml-line);font-size:12px;color:var(--ml-accent);overflow-wrap:anywhere;}
#mwi-labyrinth-calc-experience-goals{min-width:0;max-width:none;margin:0;padding:8px 0 0;background:transparent;border-top:1px solid var(--ml-line);font-size:13px;color:var(--ml-text);}
.mwi-labyrinth-calc-experience-heading{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.mwi-labyrinth-calc-experience-heading h4{margin:0;font-size:13px;font-weight:600;}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs label{display:grid;grid-template-columns:minmax(0,1fr) 68px;align-items:center;gap:6px;max-width:none;min-width:0;padding:3px 0;margin:0;border-bottom:1px solid var(--ml-line);}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs label:nth-last-child(-n+2){border-bottom:0;}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs input{width:68px;text-align:right;}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-skill{display:flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere;}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-icon{width:20px;height:20px;flex:0 0 20px;}
#mwi-labyrinth-calc-auto-estimate-control input[type="number"]{height:28px;padding:3px 6px;background:transparent;font-size:12px;}
#mwi-labyrinth-calc-auto-estimate-control button{min-height:28px;padding:4px 8px;}
#mwi-labyrinth-calc-auto-estimate-control .mwi-labyrinth-calc-auto-target>span{min-width:0;overflow-wrap:anywhere;}
.mwi-labyrinth-calc-prefill-toggle{display:flex;align-items:center;gap:8px;max-width:100%;min-height:36px;margin:8px 0;font-size:12px;font-weight:400;line-height:1.45;cursor:pointer;color:var(--ml-muted);}
.mwi-labyrinth-calc-prefill-toggle input{flex:0 0 16px;width:16px;height:16px;margin:0;}
.mwi-labyrinth-calc-prefill-toggle span{min-width:0;overflow-wrap:anywhere;}
/* Compact secondary columns while keeping room names readable. */
#mwi-labyrinth-calc-experience-goals :is(.mwi-labyrinth-calc-combat-goals-heading,.mwi-labyrinth-calc-life-goals-heading){grid-column:1/-1;padding:7px 9px;margin-top:8px;background:var(--ml-inset);border-radius:3px;font-size:12px;font-weight:650;color:var(--ml-text);}
#mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-life-goals-heading{margin-top:0;}
.mwi-labyrinth-auto-table :is(td,th){padding:6px 4px!important;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_roomLabel"]{min-width:7rem;white-space:nowrap;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_roomLabel"]>*{flex-shrink:0;}
.mwi-labyrinth-auto-table td:nth-child(2) select{width:5.5rem!important;min-width:0!important;max-width:5.5rem;}
.mwi-labyrinth-auto-table :is(td,th):nth-child(2){width:5.5rem;}
.mwi-labyrinth-auto-table :is(td,th)[class*="mwi-labyrinth-calc-auto-"]{width:4rem;min-width:4rem;max-width:5rem;}
.mwi-labyrinth-auto-table th{overflow-wrap:normal;word-break:normal;text-wrap:balance;}
.mwi-labyrinth-auto-table td:is(.mwi-labyrinth-calc-auto-estimate-cell,.mwi-labyrinth-calc-auto-recommend-cell){font-size:13px;text-align:right;padding:6px 4px;background:var(--ml-surface);}
.mwi-labyrinth-auto-table th[class*="mwi-labyrinth-calc-"]{font-size:12px;font-weight:500;color:var(--ml-muted);text-align:right;padding:6px 4px;background:var(--ml-header);}
.mwi-labyrinth-auto-table .mwi-labyrinth-calc-experience-result{font-size:11px;color:var(--ml-muted);margin:3px 0 0;}
.mwi-labyrinth-auto-table td[data-mwi-labyrinth-calc-recommend-setting]{font-size:16px;color:var(--ml-accent);font-weight:650;}
.mwi-labyrinth-auto-table td.mwi-labyrinth-calc-auto-recommend-cell:not([data-mwi-labyrinth-calc-recommend-setting]){white-space:normal;overflow-wrap:anywhere;}
.mwi-labyrinth-auto-table .mwi-labyrinth-calc-auto-recommend-cell>strong{font:inherit;}
.mwi-labyrinth-auto-table tr[data-mwi-labyrinth-adjust] td[data-mwi-labyrinth-calc-recommend-setting]{color:var(--ml-warn);}
.mwi-labyrinth-auto-table tr:has([data-mwi-labyrinth-room-group])>td{border-top:34px solid var(--ml-inset)!important;}
.mwi-labyrinth-auto-table td[data-mwi-labyrinth-room-group]{position:relative;}
.mwi-labyrinth-auto-table td[data-mwi-labyrinth-room-group]::before{content:attr(data-mwi-labyrinth-room-group);position:absolute;left:8px;top:-28px;white-space:nowrap;font-size:13px;line-height:22px;font-weight:650;color:var(--ml-text);}


.mwi-labyrinth-auto-table :is(td,th){border-bottom:1px solid var(--ml-line);}
/* Reserve the native editor's footprint in both modes so names and action buttons stay put. */
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_skipThreshold"]{display:grid!important;grid-template-columns:1.625rem 1.625rem 2rem 2.75rem;gap:.1875rem!important;align-items:center;width:8.5625rem;min-width:8.5625rem;min-height:var(--button-height-small,1.5rem);}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_skipThreshold"]>span{grid-column:1/4;text-align:right;min-width:0;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_skipThreshold"]>button:last-child{grid-column:4;width:2.75rem;min-width:2.75rem;box-sizing:border-box;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_skipThreshold"]>:is([class*="LabyrinthPanel_thresholdButtonContainer"],[class*="LabyrinthPanel_thresholdInputContainer"]){width:100%!important;min-width:0;max-width:none!important;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_skipThreshold"] button,.mwi-labyrinth-auto-table [class*="LabyrinthPanel_thresholdInputContainer"] input{height:var(--button-height-small,1.5rem)!important;box-sizing:border-box;}

/* Separate −/+ buttons already provide number stepping; leave the full input width for its value. */
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_thresholdInputContainer"] input{appearance:textfield;width:100%!important;min-width:0!important;font-size:12px!important;padding-left:1px!important;padding-right:1px!important;}
.mwi-labyrinth-auto-table [class*="LabyrinthPanel_thresholdInputContainer"] input::-webkit-inner-spin-button,.mwi-labyrinth-auto-table [class*="LabyrinthPanel_thresholdInputContainer"] input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}

/* Read-only room preview: complete data, compact rows and a shared window heading. */
#mwi-labyrinth-calc-clear-rate-preview{
 --ml-surface:#222638;--ml-header:#1c2030;--ml-line:#3d435c;--ml-text:#e8edf7;--ml-muted:#acb6ca;
 --ml-accent:#8edbc5;--ml-good:#8edbc5;--ml-warn:#edcc8c;--ml-danger:#efa0a8;
 --ml-chance-good:#b8d88b;--ml-chance-low:#efb58a;
}
#mwi-labyrinth-calc-clear-rate-preview{width:310px;min-width:0;max-width:calc(100vw - 24px);padding:0 12px 10px;border-radius:var(--ml-radius);border:1px solid var(--ml-line);background:var(--ml-surface);box-shadow:none;font-size:12px;line-height:1.45;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-clear-rate-preview__title{font-size:14px;color:var(--ml-text);padding:10px 12px;margin:0 -12px 8px;border-bottom:1px solid var(--ml-line);border-radius:var(--ml-radius) var(--ml-radius) 0 0;background:var(--ml-header);white-space:normal;overflow-wrap:anywhere;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-clear-rate-preview__row{gap:12px;padding:3px 0;white-space:normal;align-items:baseline;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-clear-rate-preview__label{color:var(--ml-muted);opacity:1;flex:1;min-width:0;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-text);font-weight:600;text-align:right;max-width:62%;overflow-wrap:anywhere;}
#mwi-labyrinth-calc-clear-rate-preview [data-emphasis="true"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-accent);font-size:16px;}
#mwi-labyrinth-calc-clear-rate-preview [data-tone="good"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-good);}
#mwi-labyrinth-calc-clear-rate-preview [data-tone="warn"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-warn);}
#mwi-labyrinth-calc-clear-rate-preview{max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--ml-field-line) var(--ml-surface);}
#mwi-labyrinth-calc-clear-rate-preview[data-scrollable="true"]{pointer-events:auto;}
#mwi-labyrinth-calc-clear-rate-preview:is([data-layout="skilling"],[data-layout="combat"]){width:320px;padding:0 10px 6px;}
#mwi-labyrinth-calc-clear-rate-preview:is([data-layout="skilling"],[data-layout="combat"]) .mwi-labyrinth-calc-clear-rate-preview__row{gap:6px;padding:1px 0;}
#mwi-labyrinth-calc-clear-rate-preview:is([data-layout="skilling"],[data-layout="combat"]) .mwi-labyrinth-calc-clear-rate-preview__title{position:sticky;top:0;z-index:1;margin:0 -10px;padding:6px 10px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-section{padding:4px 0;border-bottom:1px solid var(--ml-line);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-section:last-child{border-bottom:0;padding-bottom:0;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-section h4{margin:0 0 2px;color:var(--ml-text);font-size:12px;font-weight:600;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary:has(>:only-child){grid-template-columns:1fr;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-abilities .mwi-labyrinth-calc-clear-rate-preview__label{flex:0 0 38px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-abilities .mwi-labyrinth-calc-clear-rate-preview__value{flex:1;max-width:none;text-align:left;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
/* Color describes the outcome; emphasis alone does not imply a good result. */
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-chance-tone="excellent"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-good);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-chance-tone="good"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-chance-good);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-chance-tone="fair"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-warn);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-chance-tone="low"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-chance-low);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-chance-tone="poor"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-danger);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-experience-tone="good"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-good);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary [data-experience-tone="warn"] .mwi-labyrinth-calc-clear-rate-preview__value{color:var(--ml-warn);}

#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary .mwi-labyrinth-calc-clear-rate-preview__row{display:flex;flex-direction:column;align-items:flex-start;gap:0;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-summary .mwi-labyrinth-calc-clear-rate-preview__value{max-width:100%;font-size:17px;font-weight:650;color:var(--ml-text);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-life-yield>div{grid-column:2;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-combat-metrics>.mwi-labyrinth-calc-preview-failure{grid-column:1;grid-row:2;font-size:11px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-combat-metrics>.mwi-labyrinth-calc-preview-room-experience{grid-column:2;grid-row:2;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-footer{font-size:11px;}
#mwi-labyrinth-calc-clear-rate-preview :is(.mwi-labyrinth-calc-preview-pairs,.mwi-labyrinth-calc-preview-goals){display:grid;grid-template-columns:1fr 1fr;column-gap:12px;}
#mwi-labyrinth-calc-clear-rate-preview :is(.mwi-labyrinth-calc-preview-upgrade,.mwi-labyrinth-calc-preview-upgrade-head){display:grid;grid-column:1/-1;grid-template-columns:subgrid;column-gap:8px;align-items:baseline;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade .mwi-labyrinth-calc-clear-rate-preview__value{max-width:none;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade-head{padding:3px 0;margin-bottom:2px;background:var(--ml-header);color:var(--ml-muted);font-size:10px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade-head>span{white-space:nowrap;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade-head>span:not(:first-child),#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-delta{text-align:right;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-requirement{text-align:right;color:var(--ml-muted);overflow-wrap:anywhere;font-size:11px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-delta{color:var(--ml-muted);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-delta[data-direction="up"]{color:var(--ml-good);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-delta[data-direction="down"]{color:var(--ml-danger);}
@media(max-width:360px){
 #mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-life-yield>div{grid-column:1;}
 #mwi-labyrinth-calc-clear-rate-preview :is(.mwi-labyrinth-calc-preview-pairs,.mwi-labyrinth-calc-preview-goals){grid-template-columns:1fr;}
}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrades{display:grid;grid-template-columns:max-content repeat(3,auto);column-gap:8px;overflow-x:auto;pointer-events:auto;}
#mwi-labyrinth-calc-clear-rate-preview[data-upgrade-experience="true"] .mwi-labyrinth-calc-preview-upgrades{grid-template-columns:max-content repeat(4,auto);}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrades :is(.mwi-labyrinth-calc-preview-upgrade,.mwi-labyrinth-calc-preview-upgrade-head){column-gap:8px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrades span{white-space:nowrap;overflow-wrap:normal;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrades:focus-visible{outline:1px solid var(--ml-accent);outline-offset:-1px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade-experience{text-align:right;font-size:11px;overflow-wrap:anywhere;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-upgrade-experience[data-tone="good"]{color:var(--ml-good);}
/* Shared detail grid: stable width and matching columns for both room types. */
#mwi-labyrinth-calc-clear-rate-preview[data-layout="combat"] :is(span,.mwi-labyrinth-calc-clear-rate-preview__title){white-space:nowrap;overflow-wrap:normal;}
#mwi-labyrinth-calc-clear-rate-preview[data-layout="combat"] .mwi-labyrinth-calc-clear-rate-preview__label{min-width:max-content;}
#mwi-labyrinth-calc-clear-rate-preview[data-layout="combat"] .mwi-labyrinth-calc-clear-rate-preview__value{flex-shrink:0;max-width:none;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:12px;width:100%;}
#mwi-labyrinth-calc-clear-rate-preview[data-layout="combat"] .mwi-labyrinth-calc-preview-body{grid-template-columns:repeat(2,minmax(max-content,1fr));width:max-content;min-width:100%;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body>.mwi-labyrinth-calc-preview-section{grid-column:1/-1;min-width:0;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body>.mwi-labyrinth-calc-preview-section:has(.mwi-labyrinth-calc-preview-upgrades){contain:inline-size;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body>.mwi-labyrinth-calc-preview-section:not(:has(.mwi-labyrinth-calc-preview-upgrades)),
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body .mwi-labyrinth-calc-preview-group:not(.mwi-labyrinth-calc-preview-upgrades){display:grid;grid-template-columns:subgrid;grid-column:1/-1;column-gap:12px;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body .mwi-labyrinth-calc-preview-weakness,
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body h4,#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body .mwi-labyrinth-calc-preview-summary>:only-child{grid-column:1/-1;}
#mwi-labyrinth-calc-clear-rate-preview .mwi-labyrinth-calc-preview-body .mwi-labyrinth-calc-preview-notes>.mwi-labyrinth-calc-clear-rate-preview__row{grid-column:1/-1;}
/* Draggable windows share one scroll area, with a persistent title and close control. */
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating){padding:0;border:1px solid var(--ml-line);border-radius:var(--ml-radius);background:var(--ml-surface);box-shadow:none;font-size:12px;width:380px;max-width:calc(100vw - 24px);max-height:min(75vh,calc(100dvh - 24px));overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--ml-field-line) var(--ml-surface);}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating)>div:first-child{padding:10px 12px;border-bottom:1px solid var(--ml-line);background:var(--ml-header);position:sticky;top:0;z-index:1;gap:10px;}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating)>div:first-child>div:first-child{color:var(--ml-text);font-size:14px;font-weight:650;white-space:normal;overflow:visible;}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button{padding:5px 8px;}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button[class$="__close"]{width:32px;min-width:32px;font-size:18px;line-height:1;padding:0;}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating) button[class$="__close"]:hover{background:#56323b;color:#ffdce2;border-color:#74414b;}
:is(#mwi-labyrinth-calc-room-log-floating,#mwi-labyrinth-calc-room-distribution-floating)>div:nth-child(2){padding:10px 12px;max-height:none;overflow:visible;}
#mwi-labyrinth-calc-room-log-floating [class$="__log-list"]{max-height:none;overflow:visible;gap:0;padding:0;}
#mwi-labyrinth-calc-room-log-floating [class$="__log-item"]{padding:12px 0;margin:0;border:0;border-bottom:1px solid var(--ml-line);border-radius:0;background:none;font-size:12px;line-height:1.5;}
#mwi-labyrinth-calc-room-log-floating [class$="__log-item"]:first-child{padding-top:0;}
#mwi-labyrinth-calc-room-log-floating [class$="__log-item"]:last-child{border-bottom:0;}
#mwi-labyrinth-calc-room-log-floating [class$="__header"]{gap:8px;flex-wrap:wrap;color:var(--ml-text);}
#mwi-labyrinth-calc-room-log-floating [class$="__time"],#mwi-labyrinth-calc-room-log-floating [class$="__log-meta"]{font-size:11px;color:var(--ml-muted);opacity:1;}
#mwi-labyrinth-calc-room-log-floating [class$="--success"]{color:var(--ml-good);}
#mwi-labyrinth-calc-room-log-floating [class$="--fail"]{color:var(--ml-danger);}
#mwi-labyrinth-calc-room-log-floating [class$="--double"]{color:var(--ml-warn);background:none;-webkit-text-fill-color:currentColor;}
#mwi-labyrinth-calc-room-log-floating [class$="--unknown"]{color:var(--ml-muted);}
#mwi-labyrinth-calc-room-distribution-floating input{width:64px;}
#mwi-labyrinth-calc-room-distribution-floating [class$="__distribution-step"]{height:auto;min-height:34px;gap:8px;font-size:12px;margin:0 0 10px;}
#mwi-labyrinth-calc-room-distribution-floating [class$="__row"]{grid-template-columns:78px minmax(0,1fr) 52px;font-size:12px;min-height:24px;}
#mwi-labyrinth-calc-room-distribution-floating [class$="__bar"]{height:8px;background:var(--ml-inset);border-radius:2px;}
#mwi-labyrinth-calc-room-distribution-floating [class$="__bar"]>span{background:var(--ml-action);border-radius:2px;}
#mwi-labyrinth-calc-room-distribution-floating [class$="__meta"]{color:var(--ml-muted);font-size:12px;line-height:1.5;margin:0 0 12px;}
@container mwi-lab-recommend (max-width:560px){
 .mwi-labyrinth-calc-auto-toolbar{grid-template-columns:1fr;gap:6px;}
}
@container mwi-lab-recommend (max-width:359px){
 .mwi-labyrinth-calc-auto-actions{justify-content:space-between;width:100%;}
 #mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs{grid-template-columns:1fr;}
 #mwi-labyrinth-calc-experience-goals .mwi-labyrinth-calc-experience-inputs label:nth-last-child(2){border-bottom:1px solid var(--ml-line);}
}
@media(prefers-reduced-motion:reduce){:is(#mwi-labyrinth-planner,[id^="mwi-labyrinth-calc-"]) *{transition:none!important;}}
`;
  root.MwiLabyrinthTheme = {
    install(document) {
      let style = document.getElementById("mwi-labyrinth-calc-design-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "mwi-labyrinth-calc-design-style";
        style.textContent = css;
      }
      if (document.head.lastElementChild !== style) document.head.append(style);
    }
  };
})(globalThis);
