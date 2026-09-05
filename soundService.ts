/**
 * Web Audio API Sound Synthesizer for TaskBell
 * Generates built-in, offline-first alarm sounds without external network dependencies.
 */

import { AlarmSoundId } from '../types';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private loopIntervalId: number | null = null;
  private isPlaying = null as AlarmSoundId | null;
  private volume: number = 0.8;
  private vibrationIntervalId: number | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Classic Mechanical Alarm: Twin-bell alternating hammer strikes
   */
  private playClassicChirp(ctx: AudioContext, gainVal: number) {
    const now = ctx.currentTime;
    // Rapid twin pulses
    [0, 0.08, 0.16, 0.24].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freq = idx % 2 === 0 ? 880 : 700; // Alternating frequencies
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);

      gain.gain.setValueAtTime(gainVal, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  /**
   * Digital Clock Alarm: Crisp electronic high-pitched triple beeps
   */
  private playDigitalBeep(ctx: AudioContext, gainVal: number) {
    const now = ctx.currentTime;
    [0, 0.12, 0.24, 0.36].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1046.5, now + offset); // C6 tone

      gain.gain.setValueAtTime(gainVal * 0.45, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  /**
   * Gentle Chime: Warm harmonic chord sequence with soft decay
   */
  private playGentleChime(ctx: AudioContext, gainVal: number) {
    const now = ctx.currentTime;
    // E5, G#5, B5, E6 warm chord progression
    const notes = [659.25, 830.61, 987.77, 1318.51];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      const noteStart = now + i * 0.12;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(gainVal * 0.5, noteStart + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteStart);
      osc.stop(noteStart + 0.85);
    });
  }

  /**
   * Plays a single iteration pattern of the selected sound
   */
  public playSinglePattern(sound: AlarmSoundId) {
    try {
      const ctx = this.getAudioContext();
      const gain = this.volume;
      switch (sound) {
        case 'classic':
          this.playClassicChirp(ctx, gain);
          break;
        case 'digital':
          this.playDigitalBeep(ctx, gain);
          break;
        case 'gentle':
          this.playGentleChime(ctx, gain);
          break;
        default:
          this.playClassicChirp(ctx, gain);
      }
    } catch (err) {
      console.warn('Audio playback error (user interaction might be needed):', err);
    }
  }

  /**
   * Starts looping the alarm sound until stop() is called.
   * Also triggers rhythmic vibration if enabled and supported.
   */
  public startLoop(sound: AlarmSoundId, vibrate: boolean = true) {
    this.stop(); // Clear any existing playback
    this.isPlaying = sound;

    // Trigger first pattern immediately
    this.playSinglePattern(sound);

    // Loop duration depending on sound type
    const intervalMs = sound === 'gentle' ? 1800 : sound === 'digital' ? 1000 : 1200;

    this.loopIntervalId = window.setInterval(() => {
      if (this.isPlaying) {
        this.playSinglePattern(this.isPlaying);
      }
    }, intervalMs);

    // Vibration pattern
    if (vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 200, 400]);
        this.vibrationIntervalId = window.setInterval(() => {
          try {
            navigator.vibrate([400, 200, 400, 200, 400]);
          } catch {
            // Ignore vibration errors
          }
        }, 2000);
      } catch (err) {
        console.warn('Vibration API error:', err);
      }
    }
  }

  /**
   * Stops any currently playing alarm sound and vibration
   */
  public stop() {
    if (this.loopIntervalId !== null) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
    if (this.vibrationIntervalId !== null) {
      clearInterval(this.vibrationIntervalId);
      this.vibrationIntervalId = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
    this.isPlaying = null;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying !== null;
  }
}

export const soundService = new SoundService();
