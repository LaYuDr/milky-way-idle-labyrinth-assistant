// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["appearance"] = function (ctx) {
    ctx.ensureStyle = function ensureStyle() {
      if (document.getElementById(ctx.STYLE_ID)) {
        return;
      }
      const style = document.createElement("style");
      style.id = ctx.STYLE_ID;
      style.textContent = `
.${ctx.BADGE_CLASS} {
  position: absolute;
  right: 1px;
  bottom: 1px;
  z-index: 9;
  max-width: calc(100% - 2px);
  max-height: 24%;
  padding: 1px 3px;
  border-radius: 3px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: flex-end;
  gap: 2px;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.35);
  color: #ffffff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55);
  pointer-events: none;
  user-select: none;
}
.${ctx.BADGE_CLASS}__chance {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  flex: 0 0 auto;
}
.${ctx.BADGE_CLASS}__eta {
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  opacity: 0.95;
  flex: 0 0 auto;
}
.${ctx.LIVE_ACTION_RATE_CLASS} {
  display: inline-block;
  margin-left: 6px;
  font-size: ${ctx.LIVE_ACTION_RATE_MWITOOLS_FONT_SIZE};
  font-weight: 500;
  line-height: 1.2;
  color: ${ctx.LIVE_ACTION_RATE_MWITOOLS_COLOR};
  white-space: nowrap;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
}
.${ctx.CONTROL_CLASS} {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 4px;
  row-gap: 2px;
  width: min(372px, calc(100vw - 16px));
  box-sizing: border-box;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #f0f4ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  user-select: none;
  overflow: visible;
}
.${ctx.CONTROL_CLASS}--inline {
  margin-left: auto;
  flex: 0 0 auto;
}
.${ctx.CONTROL_CLASS}--block {
  margin: 0 0 8px 0;
}
.${ctx.CONTROL_CLASS}__button {
  min-width: 96px;
  width: auto;
  padding: 0 10px;
  height: 18px;
  border: 0;
  border-radius: 5px;
  background: #3a88ff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex: 0 0 auto;
}
.${ctx.CONTROL_CLASS}__button:disabled {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.CONTROL_LOG_TOGGLE_CLASS} {
  min-width: 54px;
  width: auto;
  padding: 0 10px;
  height: 18px;
  border: 0;
  border-radius: 5px;
  background: rgba(77, 151, 255, 0.95);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex: 0 0 auto;
}
.${ctx.CONTROL_LOG_TOGGLE_CLASS}:disabled {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(77, 151, 255, 0.18);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex: 0 0 auto;
}
.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} input {
  width: 12px;
  height: 12px;
  margin: 0;
  accent-color: #4d97ff;
}
.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS}:has(input:disabled) {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.CONTROL_DISTRIBUTION_STEP_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 18px;
  margin-bottom: 7px;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  flex: 0 0 auto;
}
.${ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS} {
  width: 36px;
  height: 18px;
  box-sizing: border-box;
  border: 1px solid rgba(150, 190, 255, 0.45);
  border-radius: 4px;
  background: rgba(20, 28, 42, 0.9);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.${ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS}:disabled {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.ROOM_DISTRIBUTION_FLOAT_CLASS} {
  position: fixed;
  top: 92px;
  width: 310px;
  max-height: min(68vh, 560px);
  box-sizing: border-box;
  border: 1px solid rgba(128, 170, 255, 0.5);
  border-radius: 8px;
  background: rgba(10, 14, 22, 0.97);
  color: #f2f7ff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
  z-index: 2147483646;
  pointer-events: auto;
  user-select: none;
}
.${ctx.ROOM_DISTRIBUTION_FLOAT_CLASS}[hidden] {
  display: none !important;
}
.${ctx.ROOM_DISTRIBUTION_HEADER_CLASS} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid rgba(146, 182, 255, 0.24);
  cursor: move;
}
.${ctx.ROOM_DISTRIBUTION_TITLE_CLASS} {
  min-width: 0;
  color: #9ec4ff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS} {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  flex: 0 0 auto;
}
.${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS}:hover {
  background: rgba(255, 108, 108, 0.45);
}
.${ctx.ROOM_DISTRIBUTION_BODY_CLASS} {
  box-sizing: border-box;
  padding: 8px 10px 10px;
  overflow-y: auto;
  max-height: calc(min(68vh, 560px) - 42px);
}
.${ctx.ROOM_DISTRIBUTION_META_CLASS} {
  margin-bottom: 5px;
  color: rgba(221, 232, 255, 0.9);
  font-size: 10px;
  line-height: 1.35;
}
.${ctx.ROOM_DISTRIBUTION_LIST_CLASS} {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.${ctx.ROOM_DISTRIBUTION_ROW_CLASS} {
  display: grid;
  grid-template-columns: 72px 1fr 48px;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  line-height: 1.2;
}
.${ctx.ROOM_DISTRIBUTION_ROW_CLASS}__label,
.${ctx.ROOM_DISTRIBUTION_ROW_CLASS}__value {
  white-space: nowrap;
}
.${ctx.ROOM_DISTRIBUTION_ROW_CLASS}__value {
  text-align: right;
  font-weight: 700;
}
.${ctx.ROOM_DISTRIBUTION_BAR_CLASS} {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}
.${ctx.ROOM_DISTRIBUTION_BAR_CLASS} > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4d97ff 0%, #61dba0 100%);
}
.${ctx.ROOM_LOG_FLOAT_CLASS} {
  position: fixed;
  top: 92px;
  right: 14px;
  width: 340px;
  max-height: min(62vh, 470px);
  box-sizing: border-box;
  border: 1px solid rgba(128, 170, 255, 0.5);
  border-radius: 8px;
  background: rgba(10, 14, 22, 0.97);
  color: #f2f7ff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
  z-index: 2147483646;
  pointer-events: auto;
  user-select: none;
}
.${ctx.ROOM_LOG_FLOAT_CLASS}[hidden] {
  display: none !important;
}
.${ctx.ROOM_LOG_FLOAT_HEADER_CLASS} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid rgba(146, 182, 255, 0.24);
  cursor: move;
}
.${ctx.ROOM_LOG_FLOAT_TITLE_CLASS} {
  min-width: 0;
  color: #9ec4ff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${ctx.ROOM_LOG_FLOAT_ACTIONS_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.${ctx.ROOM_LOG_FLOAT_CLEAR_CLASS} {
  min-width: 40px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
}
.${ctx.ROOM_LOG_FLOAT_CLEAR_CLASS}:hover {
  background: rgba(255, 181, 94, 0.45);
}
.${ctx.ROOM_LOG_FLOAT_CLOSE_CLASS} {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  flex: 0 0 auto;
}
.${ctx.ROOM_LOG_FLOAT_CLOSE_CLASS}:hover {
  background: rgba(255, 108, 108, 0.45);
}
.${ctx.CONTROL_LOG_PANEL_CLASS} {
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  padding: 8px;
}
.${ctx.CONTROL_LOG_PANEL_CLASS}__title {
  display: none;
}
.${ctx.CONTROL_LOG_LIST_CLASS} {
  max-height: calc(min(62vh, 470px) - 60px);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}
.${ctx.CONTROL_LOG_ITEM_CLASS} {
  border: 1px solid rgba(146, 182, 255, 0.25);
  border-radius: 5px;
  background: rgba(22, 31, 45, 0.92);
  padding: 6px 7px;
  font-size: 11px;
  line-height: 1.25;
}
.${ctx.CONTROL_LOG_ITEM_CLASS}__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-weight: 700;
  color: #eef6ff;
}
.${ctx.CONTROL_LOG_ITEM_CLASS}__time {
  opacity: 0.85;
  font-weight: 600;
}
.${ctx.CONTROL_LOG_META_CLASS} {
  font-size: 10px;
  color: rgba(221, 232, 255, 0.9);
  margin-bottom: 4px;
}
.${ctx.CONTROL_LOG_INCOMPLETE_CLASS} {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0 6px;
  background: rgba(244, 124, 71, 0.22);
  color: #ffba92;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}
.${ctx.CONTROL_LOG_ITEM_CLASS}__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}
.${ctx.CONTROL_LOG_ITEM_CLASS}__sep {
  opacity: 0.65;
}
.${ctx.CONTROL_LOG_ACTION_CLASS} {
  font-weight: 700;
}
.${ctx.CONTROL_LOG_ACTION_CLASS}--success {
  color: #3ddc84;
}
.${ctx.CONTROL_LOG_ACTION_CLASS}--fail {
  color: #ff6464;
}
.${ctx.CONTROL_LOG_ACTION_CLASS}--double {
  color: #ffcf5c;
  background-image: linear-gradient(90deg, #ff5e7e 0%, #ffb55e 24%, #ffe45e 42%, #63e67c 60%, #59c8ff 78%, #d78bff 100%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.${ctx.CONTROL_LOG_ACTION_CLASS}--unknown {
  color: #9ab0d8;
}
.${ctx.CONTROL_CLASS}__settings {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.${ctx.CONTROL_CLASS}__settings-label {
  font-size: 10px;
  line-height: 1;
  opacity: 0.92;
}
.${ctx.CONTROL_CLASS}__settings-input {
  width: 46px;
  height: 18px;
  box-sizing: border-box;
  border: 1px solid rgba(150, 190, 255, 0.45);
  border-radius: 4px;
  background: rgba(20, 28, 42, 0.9);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.${ctx.CONTROL_CLASS}__settings-input:disabled {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.CONTROL_CLASS}__progress {
  flex: 1 1 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.${ctx.CONTROL_CLASS}__track {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}
.${ctx.CONTROL_CLASS}__bar {
  width: 0%;
  height: 100%;
  background: linear-gradient(90deg, #57d08a 0%, #8ed447 100%);
}
.${ctx.CONTROL_CLASS}__text {
  display: none;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS} {
  margin: 6px 0 8px 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings-label {
  font-size: 11px;
  color: rgba(240, 244, 255, 0.92);
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS} {
  width: 68px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(150, 190, 255, 0.45);
  border-radius: 4px;
  background: rgba(20, 28, 42, 0.9);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_LABEL_CLASS} {
  font-size: 11px;
  color: rgba(240, 244, 255, 0.92);
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS} {
  width: 64px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(150, 190, 255, 0.45);
  border-radius: 4px;
  background: rgba(20, 28, 42, 0.9);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_LABEL_CLASS} {
  font-size: 11px;
  color: rgba(240, 244, 255, 0.92);
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS} {
  width: 64px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(150, 190, 255, 0.45);
  border-radius: 4px;
  background: rgba(20, 28, 42, 0.9);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  outline: none;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__break {
  flex-basis: 100%;
  height: 0;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button {
  min-width: 74px;
  width: auto;
  padding: 0 10px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: #3a88ff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button:disabled {
  opacity: 0.75;
  cursor: wait;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS} {
  min-width: 88px;
}
.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status {
  font-size: 12px;
  line-height: 1.2;
  color: rgba(240, 244, 255, 0.9);
}
.${ctx.AUTOMATION_MAX_FLOOR_TABLE_HEADER_CLASS} {
  width: 64px;
  min-width: 64px;
  max-width: 64px;
  white-space: nowrap;
  text-align: right;
}
.${ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS} {
  width: 64px;
  min-width: 64px;
  max-width: 64px;
  color: rgba(240, 244, 255, 0.95);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
  padding-right: 6px;
}
.${ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS} {
  width: 84px;
  min-width: 84px;
  max-width: 84px;
  white-space: nowrap;
  text-align: right;
}
.${ctx.AUTOMATION_RECOMMEND_TABLE_HEADER_CLASS} {
  width: 96px;
  min-width: 96px;
  max-width: 96px;
  white-space: nowrap;
  text-align: right;
}
.${ctx.AUTOMATION_ESTIMATE_CELL_CLASS} {
  width: 84px;
  min-width: 84px;
  max-width: 84px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: default;
  text-align: right;
  padding-right: 6px;
}
.${ctx.AUTOMATION_RECOMMEND_CELL_CLASS} {
  width: 96px;
  min-width: 96px;
  max-width: 96px;
  color: rgba(240, 244, 255, 0.95);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
  padding-right: 6px;
}
.${ctx.AUTOMATION_ESTIMATE_CELL_CLASS}__text {
  color: rgba(240, 244, 255, 0.95);
  font-weight: 600;
}
.${ctx.AUTOMATION_ESTIMATE_CELL_CHANCE_CLASS} {
  font-size: 11px;
  font-weight: 700;
}
.${ctx.AUTOMATION_ESTIMATE_CELL_ETA_CLASS} {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.92;
}
.${ctx.AUTOMATION_ESTIMATE_CELL_ETA_DANGER_CLASS} {
  color: #ff5a5a;
  opacity: 1;
  font-weight: 700;
}
div[class*="LabyrinthPanel_automationSection"] table[class*="LabyrinthPanel_automationTable"] {
  width: 100%;
  max-width: 100%;
}
table[class*="LabyrinthPanel_automationTable"] thead th:nth-child(3),
table[class*="LabyrinthPanel_automationTable"] tbody td:nth-child(3) {
  white-space: nowrap;
}
.${ctx.PREVIEW_TOOLTIP_CLASS} {
  position: fixed;
  z-index: 2147483646;
  min-width: 140px;
  max-width: 220px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(128, 170, 255, 0.45);
  background: rgba(12, 16, 24, 0.95);
  color: #f2f7ff;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  font-size: 11px;
  line-height: 1.35;
  pointer-events: none;
  display: none;
}
.${ctx.PREVIEW_TOOLTIP_CLASS}__title {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #9ec4ff;
}
.${ctx.PREVIEW_TOOLTIP_CLASS}__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  white-space: nowrap;
}
.${ctx.PREVIEW_TOOLTIP_CLASS}__label {
  opacity: 0.78;
}
.${ctx.PREVIEW_TOOLTIP_CLASS}__value {
  font-weight: 700;
  color: #ffffff;
}

`;
      document.head.appendChild(style);
    };
  };
})(globalThis);
