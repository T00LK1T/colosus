let pyodide;

// DOM elements
const inputTextArea = document.getElementById('input-text-area');
const outputImage = document.getElementById('output-image');

// global scope variables
const Global = {
  python: {
    output: "output"
  },
  js: {
    input: undefined,
  }
}

let previousInput = "";

// JS <-> Python bridge code
const userCodeGenerator = () => `
import importlib.util

module_name, module_path = 'cloud', 'cloud.pyc'

spec = importlib.util.spec_from_file_location(module_name, module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

input_text = """
${Global.js.input}
"""

with module.CloudManager(auto_save=True, output="result") as cm:
    cm.set_text(input_text)
    cm.set_stopwords({})
    cm.set_bgcolor("white")
    cm.set_font("PretendardVariable.ttf")
    cm.set_max_words(100)
    output = cm.make_wordcloud_base64()
`


// Combine pre-written Python code with user input
const combinePythonCode = (preWrittenCode, userCodeGenerator) => {
  userCode = userCodeGenerator()
  return `${preWrittenCode}\n\n${userCode}`
}

// Save base64 as binary
const saveB64AsBinary = (b64, filename) => `
  import base64
  binary = base64.b64decode("""${b64}""")
  with open("${filename}", "wb") as file:
    file.write(binary)
`


// Load Pyodide and external resources
const promiseStaticResources = async() => {
  const b64 = await loadExternalFileAsBytes("PretendardVariable.ttf")
  await pyodide.runPythonAsync(saveB64AsBinary(b64, "PretendardVariable.ttf"))
  console.log("Static resources loaded")
}
const promisePyodide = async() => {
  pyodide = await loadPyodide();
  const b64 = await loadExternalFileAsBytes("engine/cloud")
  await pyodide.runPythonAsync(saveB64AsBinary(b64, "cloud.pyc"))
  console.log("Pyodide initialized")

  await promiseStaticResources();
}

// Load external python script
const loadExternalScript = async (scriptUrl) => {
  const response = await fetch(scriptUrl);
  const scriptContent = await response.text();
  return scriptContent;
}

const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Load external file as bytes
const loadExternalFileAsBytes = async (fileUrl) => {
  const response = await fetch(fileUrl);
  const fileContent = await response.arrayBuffer();
  const bytes = new Uint8Array(fileContent);
  const base64 = arrayBufferToBase64(bytes);
  return base64;
}

const executePythonCode = async () => {
  Global.js.input = inputTextArea.value;
  if (!Global.js.input) {
    return;
  }
  if (Global.js.input === previousInput) {
    return;
  }
  if (pyodide) {
    try {
      const pythonCode = userCodeGenerator();
      await pyodide.loadPackage('micropip');
      await pyodide.loadPackage('numpy');
      await pyodide.loadPackage("pillow");
      await pyodide.loadPackage("wordcloud");
      await pyodide.runPythonAsync(pythonCode);
      // NOTE: base64 문자열로 전달받으면 이미지 출력이 잘 안되는 문제가 있음
      // charset, encoding 관련 문제로 예상되는데 충분히 테스트하고 적용할 것
      // const base64String = pyodide.globals.get(Global.python.output);

      // NOTE: 당장은 pyodide 내부의 파일시스템을 사용하여 이미지를 읽어오도록 함
      const imageData = pyodide.FS.readFile("result.png", { encoding: "binary" });
      const arrayBuffer = new Uint8Array(imageData).buffer;
      const base64String = arrayBufferToBase64(arrayBuffer);
      outputImage.src = `data:image/png;base64,${base64String}`;
      previousInput = Global.js.input;
    } catch(error) {
      console.error("Error executing Python code: ", error);
    }
  } else {
    console.error("Pyodide is not loaded");
  }
}
promisePyodide();
