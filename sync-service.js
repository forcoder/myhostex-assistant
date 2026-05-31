/**
 * MyHostex 智能回复助手 - 同步服务核心模块
 * 负责：数据备份、云端同步、本地同步状态管理
 */

class SyncService {
  constructor() {
    this.SYNC_KEYS = [
      'mha_config',
      'userStyle',
      'rooms',
      'propInfo',
      'replyRules',
      'aiConfig',
      'aiConfigs',
      'knowledgeBase',
      'settings',
    ];
    this.SYNC_METADATA_KEY = 'sync_metadata';
    this.DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟
  }

  /**
   * 获取同步元数据
   */
  async getSyncMetadata() {
    const result = await chrome.storage.local.get(this.SYNC_METADATA_KEY);
    return result[this.SYNC_METADATA_KEY] || this.createDefaultMetadata();
  }

  /**
   * 创建默认同步元数据
   */
  createDefaultMetadata() {
    return {
      lastSyncTime: null,
      lastSyncStatus: null,
      syncVersion: 1,
      deviceId: this.generateDeviceId(),
      syncHistory: [],
    };
  }

  /**
   * 生成设备唯一标识
   */
  generateDeviceId() {
    return 'device_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * 导出所有同步数据为 JSON
   * @returns {Promise<string>} 导出的 JSON 字符串
   */
  async exportData() {
    try {
      console.log('[SyncService] 开始导出数据...');

      const data = {};
      const keysToExport = await chrome.storage.local.get(this.SYNC_KEYS);

      for (const key of this.SYNC_KEYS) {
        if (keysToExport[key] !== undefined) {
          data[key] = keysToExport[key];
        }
      }

      // 添加导出元数据
      const exportMetadata = {
        exportedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        dataKeys: Object.keys(data),
      };

      const exportPackage = {
        metadata: exportMetadata,
        data: data,
      };

      console.log('[SyncService] 数据导出成功，keys:', Object.keys(data));
      return JSON.stringify(exportPackage, null, 2);
    } catch (error) {
      console.error('[SyncService] 导出数据失败:', error);
      throw new Error(`数据导出失败: ${error.message}`);
    }
  }

  /**
   * 导入数据
   * @param {string} jsonData - 导入的 JSON 字符串
   * @param {Object} options - 导入选项 { merge: boolean }
   * @returns {Promise<{ success: boolean, imported: number, skipped: number }>}
   */
  async importData(jsonData, options = { merge: false }) {
    try {
      console.log('[SyncService] 开始导入数据...');

      const parsed = JSON.parse(jsonData);
      if (!parsed.data || !parsed.metadata) {
        throw new Error('无效的导入文件格式');
      }

      const { data, metadata } = parsed;
      const result = { success: true, imported: 0, skipped: 0 };

      if (options.merge) {
        // 合并模式：合并已有数据
        const existing = await chrome.storage.local.get(this.SYNC_KEYS);

        for (const key of this.SYNC_KEYS) {
          if (data[key] !== undefined) {
            if (existing[key] === undefined) {
              // 新增
              await chrome.storage.local.set({ [key]: data[key] });
              result.imported++;
            } else if (Array.isArray(existing[key]) && Array.isArray(data[key])) {
              // 数组合并去重
              const merged = this.mergeArrays(existing[key], data[key]);
              await chrome.storage.local.set({ [key]: merged });
              result.imported++;
            } else if (typeof existing[key] === 'object' && typeof data[key] === 'object') {
              // 对象深度合并
              const merged = this.deepMerge(existing[key], data[key]);
              await chrome.storage.local.set({ [key]: merged });
              result.imported++;
            } else {
              result.skipped++;
            }
          }
        }
      } else {
        // 覆盖模式：直接替换
        for (const key of this.SYNC_KEYS) {
          if (data[key] !== undefined) {
            await chrome.storage.local.set({ [key]: data[key] });
            result.imported++;
          }
        }
      }

      // 更新同步元数据
      await this.updateSyncMetadata({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: 'import',
      });

      console.log('[SyncService] 导入完成:', result);
      return result;
    } catch (error) {
      console.error('[SyncService] 导入数据失败:', error);
      throw new Error(`数据导入失败: ${error.message}`);
    }
  }

  /**
   * 数组合并去重（基于 id 字段）
   */
  mergeArrays(arr1, arr2) {
    const idSet = new Set(arr1.map(item => item.id));
    const newItems = arr2.filter(item => !idSet.has(item.id));
    return [...arr1, ...newItems];
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * 更新同步元数据
   */
  async updateSyncMetadata(updates) {
    const metadata = await this.getSyncMetadata();
    const updated = { ...metadata, ...updates };

    // 限制历史记录数量
    if (updated.syncHistory && updated.syncHistory.length > 50) {
      updated.syncHistory = updated.syncHistory.slice(-50);
    }

    // 添加同步历史
    if (updates.lastSyncStatus) {
      updated.syncHistory = updated.syncHistory || [];
      updated.syncHistory.push({
        status: updates.lastSyncStatus,
        time: new Date().toISOString(),
      });
    }

    await chrome.storage.local.set({ [this.SYNC_METADATA_KEY]: updated });
    return updated;
  }

  /**
   * 同步数据到云端（需要外部 API 实现）
   * @param {Function} apiCallback - 实际 API 调用回调
   */
  async syncToCloud(apiCallback) {
    try {
      console.log('[SyncService] 开始云端同步...');

      const exportedData = await this.exportData();

      if (typeof apiCallback === 'function') {
        await apiCallback(exportedData);
      } else {
        throw new Error('未提供云端 API 回调');
      }

      await this.updateSyncMetadata({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: 'success',
      });

      console.log('[SyncService] 云端同步成功');
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('[SyncService] 云端同步失败:', error);

      await this.updateSyncMetadata({
        lastSyncStatus: 'error',
      });

      throw error;
    }
  }

  /**
   * 从云端拉取数据（需要外部 API 实现）
   * @param {Function} apiCallback - 实际 API 调用回调，返回 JSON 字符串
   */
  async syncFromCloud(apiCallback) {
    try {
      console.log('[SyncService] 从云端拉取数据...');

      if (typeof apiCallback !== 'function') {
        throw new Error('未提供云端 API 回调');
      }

      const cloudData = await apiCallback();
      const result = await this.importData(cloudData, { merge: true });

      await this.updateSyncMetadata({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: 'success',
      });

      console.log('[SyncService] 云端拉取成功');
      return result;
    } catch (error) {
      console.error('[SyncService] 云端拉取失败:', error);

      await this.updateSyncMetadata({
        lastSyncStatus: 'error',
      });

      throw error;
    }
  }

  /**
   * 获取存储数据统计
   */
  async getStorageStats() {
    const keys = await chrome.storage.local.get(this.SYNC_KEYS);
    const stats = {
      totalItems: 0,
      byKey: {},
    };

    for (const key of this.SYNC_KEYS) {
      const value = keys[key];
      if (value !== undefined) {
        if (Array.isArray(value)) {
          stats.byKey[key] = { type: 'array', count: value.length };
          stats.totalItems += value.length;
        } else if (typeof value === 'object') {
          stats.byKey[key] = { type: 'object', keys: Object.keys(value).length };
          stats.totalItems += Object.keys(value).length;
        } else {
          stats.byKey[key] = { type: typeof value };
          stats.totalItems++;
        }
      } else {
        stats.byKey[key] = { type: 'empty' };
      }
    }

    return stats;
  }

  /**
   * 清除所有同步数据
   */
  async clearAllData() {
    try {
      console.log('[SyncService] 清除所有同步数据...');

      const clearKeys = [...this.SYNC_KEYS, this.SYNC_METADATA_KEY];
      await chrome.storage.local.remove(clearKeys);

      console.log('[SyncService] 数据清除成功');
      return { success: true };
    } catch (error) {
      console.error('[SyncService] 清除数据失败:', error);
      throw new Error(`清除数据失败: ${error.message}`);
    }
  }

  /**
   * 合并服务器数据到本地知识库
   * @param {Object} serverData - 服务器数据
   * @param {Array} localKB - 本地知识库
   * @returns {Object} 合并结果 { merged: [], conflicts: [] }
   */
  mergeKnowledgeBase(serverData, localKB) {
    const serverRules = serverData.keywordRules || [];
    const localMap = new Map(localKB.map(r => [r.id, r]));

    const merged = [...localKB];
    const conflicts = [];

    for (const serverRule of serverRules) {
      const localRule = localMap.get(serverRule.id);

      if (!localRule) {
        // 服务器新增，本地没有，直接添加
        merged.push(this.normalizeServerRule(serverRule));
      } else if (serverRule.syncVersion > (localRule.syncVersion || 0)) {
        // 服务器版本更新，替换本地
        const idx = merged.findIndex(r => r.id === serverRule.id);
        if (idx !== -1) {
          merged[idx] = this.normalizeServerRule(serverRule);
          conflicts.push({
            type: 'server_updated',
            id: serverRule.id,
            server: serverRule,
            local: localRule
          });
        }
      } else if ((serverRule.updatedAt || 0) > (localRule.updated_at || localRule.updatedAt || 0)) {
        // 版本相同但服务器更新时间更新，使用服务器数据
        const idx = merged.findIndex(r => r.id === serverRule.id);
        if (idx !== -1) {
          merged[idx] = this.normalizeServerRule(serverRule);
        }
      }
      // 否则保留本地数据
    }

    return { merged, conflicts };
  }

  /**
   * 规范化服务器数据格式为本地格式
   * @param {Object} serverRule - 服务器端规则
   * @returns {Object} 本地格式规则
   */
  normalizeServerRule(serverRule) {
    return {
      id: serverRule.id,
      trigger_condition: serverRule.keyword || '',
      trigger_type: this.mapMatchType(serverRule.matchType),
      reply_content: serverRule.replyTemplate || '',
      applicable_properties: serverRule.targetNamesJson || '全部',
      priority: serverRule.priority || 0,
      status: serverRule.enabled ? '启用' : '禁用',
      trigger_count: 0,
      syncVersion: serverRule.syncVersion,
      created_at: serverRule.createdAt,
      updated_at: serverRule.updatedAt
    };
  }

  /**
   * 转换本地规则为服务器格式
   * @param {Object} localRule - 本地规则
   * @returns {Object} 服务器格式规则
   */
  localToServer(localRule) {
    return {
      id: localRule.id,
      keyword: localRule.trigger_condition || '',
      matchType: this.localToServerMatchType(localRule.trigger_type),
      replyTemplate: localRule.reply_content || '',
      category: '',
      targetType: 'ALL',
      targetNamesJson: localRule.applicable_properties || '全部',
      priority: localRule.priority || 0,
      enabled: localRule.status === '启用',
      createdAt: localRule.created_at || Date.now(),
      updatedAt: localRule.updated_at || Date.now()
    };
  }

  /**
   * 映射服务端匹配类型到本地匹配类型
   * @param {string} serverType - 服务端匹配类型
   * @returns {string} 本地匹配类型
   */
  mapMatchType(serverType) {
    const typeMap = {
      'CONTAINS': '关键词回复',
      'EXACT': '精确匹配',
      'REGEX': '正则表达式'
    };
    return typeMap[serverType] || '关键词回复';
  }

  /**
   * 转换本地匹配类型到服务端匹配类型
   * @param {string} localType - 本地匹配类型
   * @returns {string} 服务端匹配类型
   */
  localToServerMatchType(localType) {
    const typeMap = {
      '关键词回复': 'CONTAINS',
      '精确匹配': 'EXACT',
      '正则表达式': 'REGEX',
      'booking': 'CONTAINS',
      'checkin_checkout': 'CONTAINS',
      'inquiry_question': 'CONTAINS'
    };
    return typeMap[localType] || 'CONTAINS';
  }

  /**
   * 验证导入数据格式
   * @param {string} jsonData - 待验证的 JSON 字符串
   */
  validateImportData(jsonData) {
    try {
      const parsed = JSON.parse(jsonData);

      // 检查必要字段
      if (!parsed.metadata) {
        return { valid: false, error: '缺少 metadata 字段' };
      }

      if (!parsed.data) {
        return { valid: false, error: '缺少 data 字段' };
      }

      // 检查数据键
      const validKeys = new Set(this.SYNC_KEYS);
      const dataKeys = Object.keys(parsed.data);
      const invalidKeys = dataKeys.filter(key => !validKeys.has(key));

      if (invalidKeys.length > 0) {
        return { valid: false, error: `包含无效数据键: ${invalidKeys.join(', ')}` };
      }

      return {
        valid: true,
        metadata: parsed.metadata,
        dataKeys: dataKeys,
      };
    } catch (error) {
      return { valid: false, error: `JSON 解析失败: ${error.message}` };
    }
  }
}

// 导出服务实例
const syncService = new SyncService();