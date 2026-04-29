/**
 * 音效管理器（**H5 web-only 实现**）。
 *
 * 平台策略：本文件深度依赖 Web Audio API（AudioContext / decodeAudioData / OscillatorNode），
 * 微信小游戏运行时不支持完整 Web Audio，整文件需要在 wx build 中替换为 `sfx.wx.ts`
 * （届时新写，用 wx.createInnerAudioContext 实现）。替换走 vite.wx.config.ts 的
 * resolve.alias，业务调用方无需改动。
 *
 * 因此 SFX 不走 platform.audio 这个 runtime adapter——后者保留给"未来通用音频需求"
 * （如广告 SDK 提示音），细粒度 13 种 SFX 通过 build-time substitution 切平台更合适。
 *
 * 播放链路：
 *   AudioBufferSourceNode(SFX) → bufferGain(×SFX_BOOST) ─┐
 *   OscillatorNode(合成 fallback) → synthGain(×1) ──────┤→ masterGain(×masterVolume) → destination
 *
 * bufferGain 给真 SFX 样本加额外增益（>1），弥补 ElevenLabs 生成的短样本
 * 源峰值偏低的问题；合成 fallback 不走 bufferGain，避免 beep 被放大失真。
 * masterGain 承载 masterVolume 与 muted 开关。
 *
 * 资源加载：fetch mp3 → decodeAudioData → AudioBuffer 缓存，不依赖 Howler。
 * BGM 由 Phaser SoundManager 管理（src/audio/bgm.ts，同样 web-only），
 * sfx 不需要再调 Howler.mute 同步。
 */

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

type SampleName =
  | 'towerPlace'
  | 'towerUpgrade'
  | 'towerSell'
  | 'towerFire-macrophage'
  | 'towerFire-neutrophil'
  | 'towerFire-nkcell'
  | 'pathogenKilled'
  | 'waveStart'
  | 'waveEnd'
  | 'levelWon'
  | 'levelLost'
  | 'error'
  | 'uiClick';

const SAMPLE_NAMES: readonly SampleName[] = [
  'towerPlace',
  'towerUpgrade',
  'towerSell',
  'towerFire-macrophage',
  'towerFire-neutrophil',
  'towerFire-nkcell',
  'pathogenKilled',
  'waveStart',
  'waveEnd',
  'levelWon',
  'levelLost',
  'error',
  'uiClick',
];

// SFX 样本额外增益。Howler volume 最多到 1，无法放大低音量源；
// 用 GainNode 把样本振幅提到 1.8 倍，SFX 整体听感接近 BGM 级别。
const SFX_BOOST = 1.8;

class SfxManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bufferGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private buffers = new Map<SampleName, AudioBuffer>();
  private loaded = new Set<SampleName>();
  private failed = new Set<SampleName>();
  private preloadPromise: Promise<void> | null = null;
  private muted = false;
  private masterVolume = 0.8;

  private ensureCtx(): boolean {
    if (this.ctx) return true;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.bufferGain = this.ctx.createGain();
      this.bufferGain.gain.value = SFX_BOOST;
      this.bufferGain.connect(this.masterGain);
      this.synthGain = this.ctx.createGain();
      this.synthGain.gain.value = 1;
      this.synthGain.connect(this.masterGain);
      return true;
    } catch {
      return false;
    }
  }

  /** 用户首次交互时调用，解锁 AudioContext（suspended → running）。 */
  ensure(): void {
    this.ensureCtx();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    // 兜底：若首屏没调 preload，此处触发
    void this.preload();
  }

  /**
   * 预加载所有 SFX mp3：fetch + decodeAudioData → AudioBuffer 缓存。
   * 幂等；支持进度回调（每个完成或失败时 +1）。
   */
  preload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;
    this.ensureCtx();
    const ctx = this.ctx;
    if (!ctx) {
      this.preloadPromise = Promise.resolve();
      return this.preloadPromise;
    }
    const total = SAMPLE_NAMES.length;
    let done = 0;
    onProgress?.(done, total);
    const bump = () => {
      done++;
      onProgress?.(done, total);
    };
    this.preloadPromise = Promise.all(
      SAMPLE_NAMES.map(async (name) => {
        try {
          const res = await fetch(`/assets/sfx/${name}.mp3`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arr = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arr);
          this.buffers.set(name, buffer);
          this.loaded.add(name);
        } catch {
          this.failed.add(name);
        } finally {
          bump();
        }
      }),
    ).then(() => undefined);
    return this.preloadPromise;
  }

  setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.masterVolume;
  }

  private tryPlay(name: SampleName, extraGain = 1): boolean {
    if (this.muted) return true;
    if (!this.ensureCtx()) return false;
    const buffer = this.buffers.get(name);
    const ctx = this.ctx;
    const bufferGain = this.bufferGain;
    if (!buffer || !ctx || !bufferGain) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (extraGain !== 1) {
      const local = ctx.createGain();
      local.gain.value = extraGain;
      source.connect(local).connect(bufferGain);
    } else {
      source.connect(bufferGain);
    }
    source.start();
    return true;
  }

  private beep(
    freq: number,
    duration: number,
    type: OscType = 'sine',
    volume = 0.25,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || !this.synthGain) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.synthGain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private sweep(
    fromFreq: number,
    toFreq: number,
    duration: number,
    type: OscType = 'sine',
    volume = 0.25,
  ): void {
    if (this.muted || !this.ctx || !this.synthGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.synthGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  towerPlace(): void {
    if (this.tryPlay('towerPlace')) return;
    this.beep(440, 0.08, 'square', 0.18);
    this.beep(660, 0.08, 'square', 0.14, 0.04);
  }

  towerUpgrade(): void {
    if (this.tryPlay('towerUpgrade')) return;
    this.beep(523, 0.08, 'triangle', 0.2);
    this.beep(659, 0.08, 'triangle', 0.2, 0.06);
    this.beep(784, 0.14, 'triangle', 0.22, 0.12);
  }

  towerSell(): void {
    if (this.tryPlay('towerSell')) return;
    this.sweep(400, 120, 0.18, 'sawtooth', 0.2);
  }

  towerFire(towerType: 'macrophage' | 'neutrophil' | 'nkcell'): void {
    // macrophage 样本源素材峰值明显偏低，单独再 boost 一档
    const gain = towerType === 'macrophage' ? 3.0 : 1;
    if (this.tryPlay(`towerFire-${towerType}` as SampleName, gain)) return;
    if (towerType === 'neutrophil') this.beep(880, 0.04, 'square', 0.08);
    else if (towerType === 'nkcell') this.beep(1200, 0.05, 'triangle', 0.1);
    else this.beep(160, 0.08, 'sine', 0.08);
  }

  pathogenKilled(): void {
    if (this.tryPlay('pathogenKilled')) return;
    this.beep(220, 0.05, 'square', 0.14);
  }

  waveStart(): void {
    if (this.tryPlay('waveStart')) return;
    this.beep(110, 0.25, 'sawtooth', 0.22);
    this.beep(165, 0.2, 'sawtooth', 0.16, 0.08);
  }

  waveEnd(): void {
    if (this.tryPlay('waveEnd')) return;
    this.beep(523, 0.1, 'sine', 0.2);
    this.beep(784, 0.18, 'sine', 0.22, 0.08);
  }

  levelWon(): void {
    if (this.tryPlay('levelWon')) return;
    this.beep(523, 0.12, 'triangle', 0.25);
    this.beep(659, 0.12, 'triangle', 0.25, 0.12);
    this.beep(784, 0.12, 'triangle', 0.25, 0.24);
    this.beep(1047, 0.3, 'triangle', 0.28, 0.36);
  }

  levelLost(): void {
    if (this.tryPlay('levelLost')) return;
    this.sweep(220, 55, 0.8, 'sawtooth', 0.28);
  }

  error(): void {
    if (this.tryPlay('error')) return;
    this.beep(180, 0.05, 'square', 0.15);
    this.beep(120, 0.06, 'square', 0.12, 0.04);
  }

  uiClick(): void {
    // UI click 单独再降一档，避免和专属音效叠加时盖过主音
    if (this.tryPlay('uiClick', 0.5)) return;
    this.beep(1500, 0.03, 'sine', 0.08);
  }
}

export const sfx = new SfxManager();

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).__sfx = sfx;
}
