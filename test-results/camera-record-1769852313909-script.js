
(async function cameraTest() {
  const results = [];

  // Enumerar cámaras
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  // Filtrar cámaras según parámetro
  let targetCameras = videoDevices;
  if ('all' === 'front') {
    targetCameras = videoDevices.filter(d =>
      d.label.toLowerCase().includes('front') || d.label.includes('user'));
  } else if ('all' === 'back') {
    targetCameras = videoDevices.filter(d =>
      d.label.toLowerCase().includes('back') || d.label.includes('environment'));
  } else if ('all' === 'first') {
    targetCameras = videoDevices.slice(0, 1);
  }

  for (const camera of targetCameras) {
    try {
      // Determinar constraints
      const constraints = {
        video: {
          deviceId: { exact: camera.deviceId },
        }
      };

      // Resolución máxima si se solicita
      if ('max' === 'max') {
        constraints.video.width = { ideal: 4096 };
        constraints.video.height = { ideal: 2160 };
      } else if ('max' === 'min') {
        constraints.video.width = { ideal: 320 };
        constraints.video.height = { ideal: 240 };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      if ('record' === 'capture') {
        // Capturar frame
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        await new Promise(r => video.onloadedmetadata = r);
        await video.play();

        // Esperar un momento para estabilizar
        await new Promise(r => setTimeout(r, 500));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const dataUrl = canvas.toDataURL('image/webm', 0.95);

        results.push({
          camera: camera.label || camera.deviceId,
          type: 'capture',
          resolution: settings.width + 'x' + settings.height,
          format: 'webm',
          dataUrl: dataUrl,
          success: true
        });

        stream.getTracks().forEach(t => t.stop());

      } else if ('record' === 'record') {
        // Grabar video
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        await new Promise(r => video.onloadedmetadata = r);

        const chunks = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9'
        });

        recorder.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const recordingPromise = new Promise((resolve) => {
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          };
        });

        recorder.start(100);

        // Grabar por 5 segundos
        await new Promise(r => setTimeout(r, 5000));

        recorder.stop();
        stream.getTracks().forEach(t => t.stop());

        const dataUrl = await recordingPromise;

        results.push({
          camera: camera.label || camera.deviceId,
          type: 'record',
          resolution: settings.width + 'x' + settings.height,
          duration: 5,
          format: 'webm',
          dataUrl: dataUrl,
          success: true
        });
      }

    } catch (error) {
      results.push({
        camera: camera.label || camera.deviceId,
        type: 'record',
        success: false,
        error: error.message
      });
    }
  }

  return results;
})();
