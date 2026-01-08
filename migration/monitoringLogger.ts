/**
 * Système de logs amélioré pour le monitoring de la migration
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_STORAGE_KEY = "@migration_logs";
const MAX_LOGS = 1000; // Garder les 1000 derniers logs

export interface MigrationLog {
  timestamp: string;
  type: "tetee" | "biberon" | "miction" | "selle" | "pompage" | "vaccin" | "vitamine";
  operation: "create" | "update" | "delete" | "read";
  id: string;
  status: "success" | "error" | "partial";
  source: "OLD" | "NEW" | "BOTH";
  error?: string;
  metadata?: Record<string, any>;
}

export interface LogStats {
  totalOperations: number;
  successCount: number;
  errorCount: number;
  partialCount: number;
  successRate: number;
  errorsByType: Record<string, number>;
  errorsByOperation: Record<string, number>;
  lastError?: MigrationLog;
  recentErrors: MigrationLog[];
}

/**
 * Logger principal pour les opérations de migration
 */
export class MigrationLogger {
  private static logs: MigrationLog[] = [];
  private static initialized = false;

  /**
   * Initialise le logger en chargeant les logs existants
   */
  static async initialize() {
    if (this.initialized) return;

    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
        console.log(`📊 ${this.logs.length} logs chargés`);
      }
      this.initialized = true;
    } catch (error) {
      console.error("❌ Erreur chargement logs:", error);
      this.logs = [];
      this.initialized = true;
    }
  }

  /**
   * Enregistre une opération réussie
   */
  static logSuccess(
    type: MigrationLog["type"],
    operation: MigrationLog["operation"],
    id: string,
    source: MigrationLog["source"],
    metadata?: Record<string, any>
  ) {
    const log: MigrationLog = {
      timestamp: new Date().toISOString(),
      type,
      operation,
      id,
      status: "success",
      source,
      metadata,
    };

    this.addLog(log);

    // Console log structuré
    const emoji = this.getEmoji(operation);
    console.log(
      `${emoji} [${source}] ${type} ${operation} - ID: ${id.substring(0, 8)}...`
    );
  }

  /**
   * Enregistre une erreur
   */
  static logError(
    type: MigrationLog["type"],
    operation: MigrationLog["operation"],
    id: string,
    source: MigrationLog["source"],
    error: Error | string,
    metadata?: Record<string, any>
  ) {
    const log: MigrationLog = {
      timestamp: new Date().toISOString(),
      type,
      operation,
      id,
      status: "error",
      source,
      error: typeof error === "string" ? error : error.message,
      metadata,
    };

    this.addLog(log);

    // Console log structuré avec plus de détails
    console.error(
      `❌ [${source}] ${type} ${operation} FAILED - ID: ${id.substring(0, 8)}...`,
      log.error
    );
  }

  /**
   * Enregistre une opération partielle (succès sur une source, échec sur l'autre)
   */
  static logPartial(
    type: MigrationLog["type"],
    operation: MigrationLog["operation"],
    id: string,
    successSource: "OLD" | "NEW",
    failedSource: "OLD" | "NEW",
    error: Error | string,
    metadata?: Record<string, any>
  ) {
    const log: MigrationLog = {
      timestamp: new Date().toISOString(),
      type,
      operation,
      id,
      status: "partial",
      source: "BOTH",
      error: `${failedSource} failed: ${typeof error === "string" ? error : error.message}`,
      metadata: {
        ...metadata,
        successSource,
        failedSource,
      },
    };

    this.addLog(log);

    console.warn(
      `⚠️  [PARTIAL] ${type} ${operation} - ✅ ${successSource} / ❌ ${failedSource} - ID: ${id.substring(0, 8)}...`
    );
  }

  /**
   * Ajoute un log à la liste
   */
  private static async addLog(log: MigrationLog) {
    this.logs.push(log);

    // Limiter le nombre de logs en mémoire
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    // Sauvegarder périodiquement (tous les 10 logs)
    if (this.logs.length % 10 === 0) {
      await this.saveLogs();
    }
  }

  /**
   * Sauvegarde les logs dans AsyncStorage
   */
  private static async saveLogs() {
    try {
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error("❌ Erreur sauvegarde logs:", error);
    }
  }

  /**
   * Récupère tous les logs
   */
  static async getLogs(): Promise<MigrationLog[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return [...this.logs];
  }

  /**
   * Récupère les logs des dernières N heures
   */
  static async getRecentLogs(hours: number = 24): Promise<MigrationLog[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    const cutoffTime = cutoff.toISOString();

    return this.logs.filter((log) => log.timestamp >= cutoffTime);
  }

  /**
   * Génère des statistiques sur les logs
   */
  static async getStats(hours?: number): Promise<LogStats> {
    const logs = hours ? await this.getRecentLogs(hours) : await this.getLogs();

    const successCount = logs.filter((l) => l.status === "success").length;
    const errorCount = logs.filter((l) => l.status === "error").length;
    const partialCount = logs.filter((l) => l.status === "partial").length;

    const errorsByType: Record<string, number> = {};
    const errorsByOperation: Record<string, number> = {};

    const errors = logs.filter((l) => l.status === "error" || l.status === "partial");

    errors.forEach((log) => {
      errorsByType[log.type] = (errorsByType[log.type] || 0) + 1;
      errorsByOperation[log.operation] = (errorsByOperation[log.operation] || 0) + 1;
    });

    const recentErrors = errors.slice(-10).reverse();
    const lastError = errors.length > 0 ? errors[errors.length - 1] : undefined;

    return {
      totalOperations: logs.length,
      successCount,
      errorCount,
      partialCount,
      successRate: logs.length > 0 ? (successCount / logs.length) * 100 : 100,
      errorsByType,
      errorsByOperation,
      lastError,
      recentErrors,
    };
  }

  /**
   * Efface tous les logs
   */
  static async clearLogs() {
    this.logs = [];
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
    console.log("🗑️  Logs effacés");
  }

  /**
   * Retourne un emoji selon l'opération
   */
  private static getEmoji(operation: MigrationLog["operation"]): string {
    switch (operation) {
      case "create":
        return "➕";
      case "update":
        return "✏️";
      case "delete":
        return "🗑️";
      case "read":
        return "👁️";
      default:
        return "📝";
    }
  }

  /**
   * Génère un rapport lisible
   */
  static async generateReport(hours?: number): Promise<string> {
    const stats = await this.getStats(hours);
    const period = hours ? `dernières ${hours}h` : "total";

    const lines = [
      "═══════════════════════════════════════════════════════",
      `📊 RAPPORT DE MONITORING (${period})`,
      "═══════════════════════════════════════════════════════",
      "",
      `🔢 Total d'opérations: ${stats.totalOperations}`,
      `✅ Succès: ${stats.successCount}`,
      `❌ Erreurs: ${stats.errorCount}`,
      `⚠️  Partielles: ${stats.partialCount}`,
      `📈 Taux de réussite: ${stats.successRate.toFixed(2)}%`,
      "",
    ];

    if (stats.errorCount + stats.partialCount > 0) {
      lines.push("───────────────────────────────────────────────────────");
      lines.push("ERREURS PAR TYPE");
      lines.push("───────────────────────────────────────────────────────");
      lines.push("");

      Object.entries(stats.errorsByType).forEach(([type, count]) => {
        lines.push(`  ${type}: ${count} erreurs`);
      });

      lines.push("");
      lines.push("───────────────────────────────────────────────────────");
      lines.push("ERREURS PAR OPÉRATION");
      lines.push("───────────────────────────────────────────────────────");
      lines.push("");

      Object.entries(stats.errorsByOperation).forEach(([op, count]) => {
        lines.push(`  ${op}: ${count} erreurs`);
      });

      if (stats.lastError) {
        lines.push("");
        lines.push("───────────────────────────────────────────────────────");
        lines.push("DERNIÈRE ERREUR");
        lines.push("───────────────────────────────────────────────────────");
        lines.push("");
        lines.push(`  🕐 ${new Date(stats.lastError.timestamp).toLocaleString("fr-FR")}`);
        lines.push(`  📌 Type: ${stats.lastError.type}`);
        lines.push(`  🔧 Opération: ${stats.lastError.operation}`);
        lines.push(`  🆔 ID: ${stats.lastError.id}`);
        lines.push(`  ❌ Erreur: ${stats.lastError.error}`);
      }
    }

    lines.push("");
    lines.push("═══════════════════════════════════════════════════════");

    return lines.join("\n");
  }
}

// Initialiser au chargement du module
MigrationLogger.initialize();
