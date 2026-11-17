(function () {
  'use strict';
  CBCM.request = async (action, data = {}) => {
    const result = await chrome.runtime.sendMessage({ channel: 'cbcm', action, ...data });
    CBCM.assert(result?.ok, result?.error || 'Extension was updated. Refresh ChatGPT.');
    return result.value;
  };
  CBCM.brokerStorage = {
    get: key => CBCM.request('read', { key }),
    set: async data => {
      const keys = Object.keys(data); CBCM.assert(keys.length === 1, 'Expected one account key.');
      return CBCM.request('write', { key: keys[0], entries: data[keys[0]] });
    }
  };
})();
