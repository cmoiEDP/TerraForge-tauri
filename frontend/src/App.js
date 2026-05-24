import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import TerrainStudio from "@/TerraForge/pages/TerrainStudio";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TerrainStudio />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
