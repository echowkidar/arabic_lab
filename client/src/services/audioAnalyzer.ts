export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private javascriptNode: ScriptProcessorNode | null = null;
  private isAnalyzing = false;

  start(stream: MediaStream, onVolumeChange: (volume: number) => void) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.microphone.connect(this.analyser);
      this.analyser.connect(this.javascriptNode);
      this.javascriptNode.connect(this.audioContext.destination);

      this.isAnalyzing = true;

      this.javascriptNode.onaudioprocess = () => {
        if (!this.isAnalyzing || !this.analyser) return;
        const array = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(array);

        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;
        // Normalize 0..100
        const volume = Math.min(100, Math.round((average / 128) * 100));
        onVolumeChange(volume);
      };
    } catch (e) {
      console.warn('Audio analyzer initialization skipped or not supported:', e);
    }
  }

  stop() {
    this.isAnalyzing = false;
    if (this.javascriptNode) {
      this.javascriptNode.disconnect();
      this.javascriptNode = null;
    }
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
