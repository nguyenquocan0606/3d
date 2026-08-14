import { IPrinterProvider, PrinterStatusData } from '../../types';

export class BambuLabProvider implements IPrinterProvider {
  private url: string;
  private apiKey: string;
  private printerStatuses: Map<string, PrinterStatusData> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  // true sau khi disconnect() — chặn connect() đang chạy dở khởi động polling mồ côi
  private isStopped = false;
  // In HA, we don't naturally get a list of printers unless we search entities.
  // We will track which printerIds are requested and poll for their states.
  private activePrinters: Set<string> = new Set();

  constructor(url: string, apiKey: string) {
    this.url = url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey; // This is the Home Assistant Long-Lived Access Token
  }

  async connect(): Promise<void> {
    console.log(`[BambuLabProvider HA] Connecting to Home Assistant at ${this.url}`);
    this.isStopped = false;

    try {
      // Test connection to Home Assistant API
      const res = await fetch(`${this.url}/api/config`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to connect to Home Assistant: ${res.statusText}`);
      }

      // Nếu đã bị disconnect trong lúc chờ fetch (bị provider mới đè) → không start polling
      if (this.isStopped) {
        console.log('[BambuLabProvider HA] Connect finished after disconnect — skip polling.');
        return;
      }

      console.log(`[BambuLabProvider HA] Successfully connected to Home Assistant`);
      this.startPolling();
    } catch (error) {
      console.error('[BambuLabProvider HA] Connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isStopped = true;
    this.stopPolling();
    console.log('[BambuLabProvider HA] Disconnected');
  }

  async fetchPrinters(): Promise<any[]> {
    try {
      // Fetch all entities from HA and look for print_status sensors
      const res = await fetch(`${this.url}/api/states`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });
      
      if (!res.ok) return [];
      const states: any[] = await res.json();
      
      // Find all entities that end in _print_status
      const printers = states
        .filter(s => s.entity_id.startsWith('sensor.') && s.entity_id.endsWith('_print_status'))
        .map(s => {
          const prefix = s.entity_id.replace('sensor.', '').replace('_print_status', '');
          // In HA, it's hard to get a real device ID via REST API without the device registry, 
          // but we can use the entity prefix as the unique identifier.
          return {
            id: prefix,
            name: s.attributes?.friendly_name?.replace(' Print Status', '') || prefix,
            status: s.state
          };
        });
        
      return printers;
    } catch (error) {
      console.error('[BambuLabProvider HA] Error fetching printers:', error);
      return [];
    }
  }

  getStatus(printerId: string): PrinterStatusData | null {
    // Note that printerId is requested, so we add it to the polling list if not there
    if (printerId && !this.activePrinters.has(printerId)) {
      this.activePrinters.add(printerId);
      // Immediately do a poll if it's new
      this.pollStatus();
    }
    return this.printerStatuses.get(printerId) || null;
  }

  async sendCommand(printerId: string, command: string, payload?: any): Promise<boolean> {
    try {
      const prefix = printerId.replace(/-/g, '_').toLowerCase();
      let serviceDomain = '';
      let serviceAction = '';
      let entityId = '';
      let servicePayload: any = {};

      if (command === 'light') {
        const isOn = payload?.on === true || payload?.on === 'true';
        serviceDomain = 'light';
        serviceAction = isOn ? 'turn_on' : 'turn_off';
        entityId = `light.${prefix}_chamber_light`;
      } else if (command === 'temp-nozzle') {
        serviceDomain = 'number';
        serviceAction = 'set_value';
        entityId = `number.${prefix}_nozzle_target_temperature`;
        servicePayload = { value: payload?.target || 0 };
      } else if (command === 'temp-bed') {
        serviceDomain = 'number';
        serviceAction = 'set_value';
        entityId = `number.${prefix}_bed_target_temperature`;
        servicePayload = { value: payload?.target || 0 };
      } else if (command === 'fan') {
        // Typically in HA bambulab, part cooling fan is a number entity or fan entity
        serviceDomain = 'number';
        serviceAction = 'set_value';
        entityId = `number.${prefix}_part_cooling_fan_speed`;
        servicePayload = { value: payload?.speed || 0 };
      } else if (['pause', 'resume', 'stop'].includes(command)) {
        serviceDomain = 'button';
        serviceAction = 'press';
        if (command === 'pause') entityId = `button.${prefix}_pause_printing`;
        if (command === 'resume') entityId = `button.${prefix}_resume_printing`;
        if (command === 'stop') entityId = `button.${prefix}_stop_printing`;
      } else if (command === 'sync-ams') {
        const spools = payload?.spools || [];
        // Gửi từng cuộn nhựa lên AMS qua HA service bambu_lab.set_filament
        let successCount = 0;
        for (const spool of spools) {
          if (!spool.printerSlot) continue;
          const trayId = `sensor.${prefix}_ams_1_tray_${spool.printerSlot}`;
          
          let hex = (spool.filament?.colorHex || '#FFFFFF').replace('#', '').toUpperCase();
          if (hex.length === 6) hex += 'FF'; // Thêm Alpha channel

          let filamentId = 'GFL99'; // Default Generic PLA
          const type = spool.filament?.type?.toUpperCase() || 'PLA';
          if (type.includes('PETG')) filamentId = 'GFG99';
          else if (type.includes('ABS')) filamentId = 'GFB99';
          else if (type.includes('TPU')) filamentId = 'GFU99';
          
          let minTemp = 190;
          let maxTemp = 230;
          if (type.includes('PETG')) { minTemp = 220; maxTemp = 260; }
          else if (type.includes('ABS')) { minTemp = 240; maxTemp = 280; }
          
          try {
            const res = await fetch(`${this.url}/api/services/bambu_lab/set_filament`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                entity_id: trayId,
                tray_info_idx: filamentId,
                tray_color: hex,
                tray_type: type,
                nozzle_temp_min: minTemp,
                nozzle_temp_max: maxTemp
              })
            });
            if (res.ok) successCount++;
            else console.error(`[BambuLabProvider HA] Failed to set filament for ${trayId}:`, await res.text());
          } catch (err) {
            console.error(`[BambuLabProvider HA] Error setting filament for ${trayId}:`, err);
          }
        }
        return successCount > 0 || spools.length === 0;
      }

      if (serviceDomain && serviceAction && entityId) {
        const res = await fetch(`${this.url}/api/services/${serviceDomain}/${serviceAction}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ entity_id: entityId, ...servicePayload })
        });
        
        if (!res.ok) {
          console.error(`[BambuLabProvider HA] Failed to send ${command}: ${res.statusText}`);
          return false;
        }
        return true;
      }
      
      console.log(`[BambuLabProvider HA] Command ${command} to printer ${printerId} is not supported in this HA integration yet.`);
      return false;
    } catch (e) {
      console.error(`[BambuLabProvider HA] Error sending command ${command}:`, e);
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- giữ chữ ký theo thiết kế, sẽ dùng khi tích hợp QR
  async setFilament(printerId: string, amsId: number, trayId: number, type: string, colorHex: string): Promise<boolean> {
    // According to HA BambuLab integration, there isn't a standard REST endpoint to change filament properties directly easily
    // This will be integrated with the QR scanning mechanism later.
    console.log(`[BambuLabProvider HA] setFilament called for ${printerId}. This will be integrated with QR scanning.`);
    return false;
  }

  private startPolling() {
    this.stopPolling();
    // Poll every 5 seconds
    this.pollingInterval = setInterval(() => this.pollStatus(), 5000);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollStatus() {
    if (this.activePrinters.size === 0) return;

    try {
      // Fetch all states from HA
      const res = await fetch(`${this.url}/api/states`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });
      
      if (!res.ok) return;
      const states: any[] = await res.json();

      for (const printerId of this.activePrinters) {
        this.updatePrinterStatus(printerId, states);
      }
    } catch (error) {
      console.error(`[BambuLabProvider HA] Error polling status:`, error);
    }
  }

  // Sensor "Remaining time" của HA trả về SỐ THẬP PHÂN ĐƠN VỊ GIỜ (unit: h,
  // device_class: duration) — VD state "2.88333333333333" nghĩa là 2h53m.
  // UI Home Assistant tự format đẹp thành "2h 53m" nhưng đó chỉ là hiển thị,
  // giá trị thô qua REST API luôn là số giờ thập phân, KHÔNG phải phút.
  private parseRemainingMinutes(raw: string | null): number {
    if (!raw) return 0;
    const trimmed = raw.trim();

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed) * 60;

    // Dự phòng cho các bản integration khác có thể trả chuỗi dạng "Xh Ym" / "Xm"
    const hoursMatch = trimmed.match(/(\d+)\s*h/i);
    const minsMatch = trimmed.match(/(\d+)\s*m/i);
    if (!hoursMatch && !minsMatch) return 0;

    const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    return hours * 60 + mins;
  }

  private updatePrinterStatus(printerId: string, states: any[]) {
    // In Home Assistant, entities usually use underscores instead of hyphens
    const prefix = printerId.replace(/-/g, '_').toLowerCase();
    
    // Find relevant states for this printer
    const printerStates = states.filter(s => s.entity_id.includes(prefix));
    
    const getEntityState = (suffix: string) => {
      const entity = printerStates.find(s => s.entity_id === `sensor.${prefix}_${suffix}` || s.entity_id === `sensor.${prefix}_${suffix.replace(/_/g, '')}`);
      return entity ? entity.state : null;
    };

    // BambuLab HA Print Status mappings
    // Typically: "finish", "running", "pause", "offline", "idle"
    let mappedStatus: 'idle' | 'printing' | 'offline' | 'maintenance' | 'error' = 'idle';
    const rawState = getEntityState('print_status')?.toUpperCase() || 'UNKNOWN';

    if (rawState === 'RUNNING' || rawState === 'PREPARE') mappedStatus = 'printing';
    else if (rawState === 'PAUSE' || rawState === 'FAILED') mappedStatus = 'error';
    else if (rawState === 'OFFLINE' || rawState === 'UNAVAILABLE' || rawState === 'UNKNOWN') mappedStatus = 'offline';
    else if (rawState === 'FINISH' || rawState === 'IDLE') mappedStatus = 'idle';

    const currentStatus: PrinterStatusData = {
      status: mappedStatus,
      nozzleTemp: parseFloat(getEntityState('nozzle_temperature') || '0'),
      nozzleTargetTemp: parseFloat(getEntityState('nozzle_target_temperature') || '0'),
      bedTemp: parseFloat(getEntityState('bed_temperature') || '0'),
      bedTargetTemp: parseFloat(getEntityState('bed_target_temperature') || '0'),
      progress: parseFloat(getEntityState('print_progress') || '0'),
      remainingTimeSeconds: this.parseRemainingMinutes(getEntityState('remaining_time')) * 60,
      fileName: getEntityState('gcode_filename') || getEntityState('task_name') || getEntityState('gcode_file_downloaded') || undefined,
      previewUrl: (() => {
        const coverImageEntity = printerStates.find(s => s.entity_id === `image.${prefix}_cover_image`);
        return coverImageEntity?.attributes?.entity_picture ? `${this.url}${coverImageEntity.attributes.entity_picture}` : undefined;
      })(),
      materials: [],
      extendedInfo: {
        provider: 'bambulab',
        payload: {
          name: printerStates.find(s => s.entity_id === `sensor.${prefix}_printer_name`)?.state || prefix,
          current_print: getEntityState('gcode_filename') || getEntityState('task_name') || getEntityState('gcode_file_downloaded'),
          layer_num: parseInt(getEntityState('current_layer') || '0'),
          total_layers: parseInt(getEntityState('total_layer_count') || '0'),
          remaining_time: this.parseRemainingMinutes(getEntityState('remaining_time')),
          temperatures: {
            nozzle: parseFloat(getEntityState('nozzle_temperature') || '0'),
            nozzle_target: parseFloat(getEntityState('nozzle_target_temperature') || '0'),
            bed: parseFloat(getEntityState('bed_temperature') || '0'),
            bed_target: parseFloat(getEntityState('bed_target_temperature') || '0'),
          },
          cooling_fan_speed: parseInt(getEntityState('cooling_fan_speed') || '0'),
          speed_level: getEntityState('speed_profile') || 'N/A',
          nozzles: [{
             nozzle_diameter: getEntityState('nozzle_size'),
             nozzle_type: getEntityState('nozzle_type')
          }],
          chamber_light: printerStates.find(s => s.entity_id === `light.${prefix}_chamber_light`)?.state === 'on',
          firmware_version: printerStates.find(s => s.entity_id === `binary_sensor.${prefix}_firmware`)?.attributes?.installed_version || 'N/A',
          print_weight: getEntityState('print_weight'),
          print_length: getEntityState('print_length'),
          print_bed_type: getEntityState('print_bed_type'),
          printable_objects: getEntityState('printable_objects'),
          skipped_objects: getEntityState('skipped_objects'),
          start_time: getEntityState('start_time'),
          end_time: getEntityState('end_time'),
          previewUrl: (() => {
            const coverImageEntity = printerStates.find(s => s.entity_id === `image.${prefix}_cover_image`);
            return coverImageEntity?.attributes?.entity_picture ? `${this.url}${coverImageEntity.attributes.entity_picture}` : undefined;
          })()
        }
      }
    };

    // Parse AMS Data
    const materials = [];
    for (let i = 1; i <= 4; i++) {
      const trayEntity = printerStates.find(s => s.entity_id === `sensor.${prefix}_ams_1_tray_${i}`);
      if (trayEntity && trayEntity.state !== 'Empty' && trayEntity.state !== 'unknown' && trayEntity.state !== 'unavailable') {
        let colorHex = trayEntity.attributes?.color || '#ffffff';
        if (colorHex && !colorHex.startsWith('#')) {
          colorHex = '#' + colorHex.substring(0, 6);
        } else if (colorHex && colorHex.length > 7) {
          // Sometimes HA returns 8 chars for color e.g. #00000000
          colorHex = colorHex.substring(0, 7);
        }
        materials.push({
          name: trayEntity.state,
          color: colorHex
        });
      } else {
        // If a tray is explicitly Empty, we can optionally push a null or let the UI handle gaps if we push nothing.
        // Wait, the UI loops by index up to materials.length, so we MUST push null if empty to maintain slot order.
        materials.push(null);
      }
    }

    // Filter out nulls from the END of the array to avoid trailing empty slots if not needed,
    // but the UI explicitly maps materials by index. Actually, CloudPrinterCard does: `liveStatus?.materials?.[idx]`.
    // So keeping nulls is perfect to keep the array length at 4 and preserve slot positions.
    currentStatus.materials = materials as any;

    this.printerStatuses.set(printerId, currentStatus);
  }
}
