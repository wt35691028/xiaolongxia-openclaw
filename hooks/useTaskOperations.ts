/* 
    1. **修改原因**：封装任务操作逻辑
    2. **解决问题**：统一任务状态变更处理
    3. **影响范围已评估**：影响所有任务操作
*/
/**
 * 任务操作组合 Hook
 * 创建时间：2025-01-29
 * 功能：组合所有任务相关的 Hooks,提供统一的任务操作接口
 * 1. 修改原因：提供高层次的任务操作抽象
 * 2. 解决问题：简化组件中的操作逻辑,统一业务流程
 * 3. 影响范围已评估：仅影响业务逻辑封装,不影响UI
 */

import { useCallback } from 'react';
import type { DbTask } from '../types';
import { useGeolocation, type Coordinates } from './useGeolocation';
import { useTaskStatus, type TaskUpdateData } from './useTaskStatus';
import { usePhotoUpload } from './usePhotoUpload';
import { useErrorHandler } from './useErrorHandler';
import { sanitizeTask } from '../utils/taskEnricher';
import { supabase } from '../services/supabaseClient';
import { taskService } from '../services/split/tasks/TaskService';
import { SupabaseClient } from '@supabase/supabase-js';

export interface TaskOperationsOptions {
  requireLocation?: boolean;
  maxDistance?: number;
  enablePhotoUpload?: boolean;
  client?: SupabaseClient;
}

/**
 * 任务操作组合 Hook
 */
export function useTaskOperations(options: TaskOperationsOptions = {}) {
  const { requireLocation = true, maxDistance = 0.5, enablePhotoUpload = true, client } = options;

  // 组合子 Hooks
  const geolocation = useGeolocation();
  const taskStatus = useTaskStatus(client);
  const photoUpload = enablePhotoUpload ? usePhotoUpload() : null;
  const errorHandler = useErrorHandler();

  /**
   * 开始任务
   */
  const handleStartTask = useCallback(
    async (
      task: DbTask,
      targetLocation?: Coordinates,
      additionalData?: Partial<DbTask>,
    ): Promise<boolean> => {
      try {
        let location: Coordinates | undefined;

        // 定位验证
        if (requireLocation && targetLocation) {
          try {
            const result = await geolocation.verifyDistance(targetLocation, maxDistance);

            if (!result.isValid) {
              // 如果距离验证明确失败（距离过远），仍然显示警告并阻止
              // 注意：如果是 GPS 获取失败，会进入内层 catch
              errorHandler.showWarning(`距离过远 (${result.distance.toFixed(2)}km)，无法开始任务`);
              return false;
            }

            location = await geolocation.getCurrentLocation();
          } catch (geoError) {
            console.warn(
              '[TaskOps] GPS verification failed, proceeding without location:',
              geoError,
            );
            // 容错机制：GPS 失败不阻止任务开始
          }
        } else if (requireLocation) {
          // 只需要记录位置，不需要验证距离
          try {
            location = await geolocation.getCurrentLocation();
          } catch (geoError) {
            console.warn('[TaskOps] GPS location failed, proceeding without location:', geoError);
          }
        }

        // 更新任务状态
        await taskStatus.startTask(task, { location, ...additionalData });

        return true;
      } catch (error) {
        errorHandler.handleError(error, '开始任务');
        return false;
      }
    },
    [requireLocation, maxDistance, geolocation, taskStatus, errorHandler],
  );

  /**
   * 完成任务
   */
  const handleCompleteTask = useCallback(
    async (task: DbTask, additionalData?: TaskUpdateData): Promise<boolean> => {
      try {
        let location: Coordinates | undefined;

        // 获取定位
        if (requireLocation) {
          try {
            location = await geolocation.getCurrentLocation();
          } catch (geoError) {
            console.warn('[TaskOps] GPS location failed, proceeding without location:', geoError);
            // 容错机制：GPS 失败不阻止任务完成
          }
        }

        // 构建完成数据
        const completeData: TaskUpdateData = {
          location,
          ...additionalData,
        };

        // 添加照片
        if (photoUpload && photoUpload.photos.length > 0) {
          completeData.photos = photoUpload.photos;
        }

        // 完成任务
        await taskStatus.completeTask(task, completeData);

        // 清空照片
        if (photoUpload) {
          photoUpload.clearPhotos();
        }

        errorHandler.showSuccess('任务已完成');
        return true;
      } catch (error) {
        errorHandler.handleError(error, '完成任务');
        return false;
      }
    },
    [requireLocation, geolocation, taskStatus, photoUpload, errorHandler],
  );

  /**
   * 暂停任务
   */
  const handlePauseTask = useCallback(
    async (task: DbTask): Promise<boolean> => {
      try {
        await taskStatus.pauseTask(task);
        errorHandler.showSuccess('任务已暂停');
        return true;
      } catch (error) {
        errorHandler.handleError(error, '暂停任务');
        return false;
      }
    },
    [taskStatus, errorHandler],
  );

  /**
   * 更新任务标记
   */
  const handleUpdateFlags = useCallback(
    async (
      task: DbTask,
      flags: {
        flag_luggage?: boolean;
        flag_arrived?: boolean;
        flag_not_out?: boolean;
      },
    ): Promise<boolean> => {
      try {
        await taskStatus.updateTaskFlags(task, flags);
        return true;
      } catch (error) {
        errorHandler.handleError(error, '更新标记');
        return false;
      }
    },
    [taskStatus, errorHandler],
  );

  return {
    // 任务操作
    handleStartTask,
    handleCompleteTask,
    handlePauseTask,
    handleUpdateFlags,

    // 子 Hooks 暴露
    geolocation,
    taskStatus,
    photoUpload,
    errorHandler,

    // 工具函数
    getCurrentLocation: geolocation.getCurrentLocation,
    verifyDistance: geolocation.verifyDistance,
    uploadPhoto: photoUpload?.uploadPhoto,
    photos: photoUpload?.photos || [],
    wrapAsync: errorHandler.wrapAsync,
    ensureTaskExists: async (task: DbTask) => {
      try {
        const db = client || supabase;
        // Check if task exists in DB
        const { data: existingTask } = await db
          .from('tasks')
          .select('id')
          .eq('id', task.id)
          .maybeSingle();

        if (existingTask) {
          return existingTask.id;
        }

        // Task doesn't exist (virtual task), create it
        console.log(`[TaskOps] Task ${task.id} not found in DB, creating...`);

        // Ensure ID is valid integer
        let newTaskId = task.id;
        if (typeof newTaskId !== 'number') {
          // Try to parse if string
          const parsed = parseInt(String(newTaskId), 10);
          if (!isNaN(parsed)) {
            newTaskId = parsed;
          } else {
            // Fallback to random
            newTaskId = Math.floor(Date.now() + Math.random() * 1000);
          }
        }

        // Sanitize task object to remove UI-only fields if any
        const newTask = { ...sanitizeTask(task), id: newTaskId };

        if (client) {
          const { error } = await client.from('tasks').insert(newTask);
          if (error) throw error;
        } else {
          const { error } = await taskService.createTask(newTask);
          if (error) throw error;
        }

        return newTaskId;
      } catch (error) {
        console.error('Failed to ensure task exists:', error);
        throw error;
      }
    },
  };
}

export default useTaskOperations;
