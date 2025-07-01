import { useState } from 'react';
import ModelViewer from './components/ModelViewer';
import logo from '/logo.png';

const App = () => {
  const [texture, setTexture] = useState('/textures/red-saree.jpg');
  const [uploadedURL, setUploadedURL] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [skinTone, setSkinTone] = useState('');

  const textureOptions = [
    'red-saree.jpg',
    'yellow-saree.jpg',
    'orange-saree.png',
    'blue-saree.jpg',
  ];

  const skinToneRecommendations = {
    fair: 'red-saree.jpg',
    medium: 'blue-saree.jpg',
    dusky: 'yellow-saree.jpg',
  };

  const handleTextureChange = (file) => {
    setTexture(`/textures/${file}`);
    setUploadedURL(null);
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setUploadedURL(URL.createObjectURL(file));
    }
  };

  const suggestSaree = () => {
    const suggestion = skinToneRecommendations[skinTone];
    if (suggestion) {
      setTexture(`/textures/${suggestion}`);
      setUploadedURL(null);
    }
  };

  const currentTexture = uploadedURL || texture;

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden bg-cover bg-center bg-no-repeat p-4"
      style={{ backgroundImage: "url('/textures/bg-fabric-light.jpeg')" }}
      // style={{ backgroundImage: 'linear-gradient(135deg, #fdf6f0, #ffe3e1)' }}
    >
      <div className="w-full max-w-7xl mx-auto px-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <img
            src={logo}
            alt="Logo"
            className="w-24 h-auto object-contain max-w-[150px] sm:max-w-[120px] md:max-w-[100px]"
          />
          <h1 className="text-3xl font-bold text-gray-800 text-center flex-1">
            Virtual Saree Try-On
          </h1>
          <div className="w-10 h-10 md:w-12 md:h-12" /> {/* Spacing symmetry */}
        </header>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full md:w-1/4 bg-white/90 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Choose Saree</h2>
              <div className="space-y-3">
                {textureOptions.map((file) => {
                  const isActive = texture.includes(file) && !uploadedURL;
                  const color = file.split('-')[0];
                  return (
                    <button
                      key={file}
                      onClick={() => handleTextureChange(file)}
                      className={`w-full px-4 py-2 text-left rounded-lg border transition ${
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'bg-white hover:bg-gray-100'
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upload Option */}
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Upload your own texture
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="w-full text-sm border rounded-md p-2"
              />
            </div>

            {/* Skin Tone Recommender */}
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Select Skin Tone
              </label>
              <select
                value={skinTone}
                onChange={(e) => setSkinTone(e.target.value)}
                className="w-full p-2 rounded-md border bg-white"
              >
                <option value="">-- Choose --</option>
                <option value="fair">Fair</option>
                <option value="medium">Medium</option>
                <option value="dusky">Dusky</option>
              </select>
              <button
                onClick={suggestSaree}
                disabled={!skinTone}
                className="w-full mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
              >
                💡 Suggest Best Saree
              </button>
            </div>

            {/* Rotation Toggle */}
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className="w-full mt-4 px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm"
            >
              {autoRotate ? '⏸ Pause Rotation' : '▶️ Resume Rotation'}
            </button>
          </aside>

          {/* 3D Viewer */}
          <main className="flex-1 overflow-hidden">
            <div className="w-full h-full overflow-hidden rounded-xl">
              <ModelViewer texturePath={currentTexture} autoRotate={autoRotate} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
