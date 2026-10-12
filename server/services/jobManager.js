import { EventEmitter } from 'node:events';

class JobManager {
  constructor() {
    this.jobs = new Map();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);

    // Periodic cleanup of completed/failed jobs older than 1 hour
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [id, job] of this.jobs.entries()) {
        if (['completed', 'failed'].includes(job.status) && job.completedAt < oneHourAgo) {
          this.jobs.delete(id);
        }
      }
    }, 10 * 60 * 1000).unref();
  }

  createJob(type, payload = {}) {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const total = payload.requestedCount || payload.count || 0;
    const job = {
      id,
      type,
      payload,
      status: 'pending',
      progress: {
        current: 0,
        total,
        percent: 0,
        message: 'Initializing search task...',
      },
      logs: [],
      result: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  updateProgress(id, { step = 'progress', message, current, total, percent } = {}) {
    const job = this.jobs.get(id);
    if (!job || ['completed', 'failed'].includes(job.status)) return;

    job.status = 'running';
    job.updatedAt = Date.now();

    if (total != null) job.progress.total = total;
    if (current != null) job.progress.current = current;
    if (percent != null) {
      job.progress.percent = Math.min(100, Math.max(0, percent));
    } else if (job.progress.total > 0 && current != null) {
      job.progress.percent = Math.min(100, Math.round((current / job.progress.total) * 100));
    }
    if (message) job.progress.message = message;

    const logEntry = {
      timestamp: Date.now(),
      step,
      message: message || `Step: ${step}`,
    };
    job.logs.push(logEntry);
    if (job.logs.length > 50) job.logs.shift();

    this.emitter.emit(`job:${id}`, {
      type: 'progress',
      progress: job.progress,
      log: logEntry,
    });
  }

  completeJob(id, result) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'completed';
    job.result = result;
    job.completedAt = Date.now();
    job.updatedAt = Date.now();
    job.progress.current = job.progress.total;
    job.progress.percent = 100;
    job.progress.message = 'Lead discovery completed.';

    const logEntry = {
      timestamp: Date.now(),
      step: 'completed',
      message: `Completed successfully. Harvested ${result.leads?.length || 0} leads.`,
    };
    job.logs.push(logEntry);

    this.emitter.emit(`job:${id}`, {
      type: 'completed',
      result,
      progress: job.progress,
      log: logEntry,
    });
  }

  failJob(id, error) {
    const job = this.jobs.get(id);
    if (!job) return;

    const errMsg = error?.message || String(error || 'Search failed');
    job.status = 'failed';
    job.error = errMsg;
    job.completedAt = Date.now();
    job.updatedAt = Date.now();
    job.progress.message = `Failed: ${errMsg}`;

    const logEntry = {
      timestamp: Date.now(),
      step: 'failed',
      message: errMsg,
    };
    job.logs.push(logEntry);

    this.emitter.emit(`job:${id}`, {
      type: 'failed',
      error: errMsg,
      progress: job.progress,
      log: logEntry,
    });
  }

  subscribe(id, callback) {
    const eventName = `job:${id}`;
    this.emitter.on(eventName, callback);
    return () => this.emitter.off(eventName, callback);
  }
}

export const jobManager = new JobManager();
