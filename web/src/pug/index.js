// ES Module imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

// 3D 擲筊類 (使用 Three.js + Cannon.js)
class MoonBlocks {
  constructor() {
    this.throwBtn = document.getElementById('throw-btn');
    this.floorToggle = document.getElementById('floor-toggle'); // 地板/運鏡開關
    this.countHoly = document.getElementById('count-holy');
    this.countLaughing = document.getElementById('count-laughing');
    this.countAngry = document.getElementById('count-angry');
    this.container = document.getElementById('canvas-container');
    this.resultOverlay = document.getElementById('result-overlay');

    this.isThrowing = false;
    this.stats = { holy: 0, laughing: 0, angry: 0 }; // 統計數據
    this.blocks = [];
    this.moonblockModel = null;
    this.modelLoaded = false;
    this.isShowingResult = false;
    this.isFinishing = false;
    
    // 相機旋轉與特效控制
    this.isRotatingCamera = false;
    this.isCameraEffectEnabled = false; // 預設關閉
    this.cameraAngle = 0;

    // 音效系統
    this.sounds = [];
    for (let i = 1; i <= 4; i++) {
        const audio = new Audio(`sound-${i}.mp3`); // 修正為 mp3
        audio.preload = 'auto'; // 預加載
        this.sounds.push(audio);
    }
    // 全局防抖動用於防止多個物體同時碰撞時聲音過於密集
    // 但單個物體碰撞後應該獨立計算
    // this.lastSoundTime = 0; // 移除全局防抖動

    // 模型的幾何數據（從 GLB 中提取）
    this.modelGeometry = null;
    this.modelBoundingBox = null;
    this.modelCenter = null;

    this.results = {
      holy: { name: '聖筊', meaning: '【神明應允 · 吉祥可行】 一陰一陽，代表萬事協調。神明同意您的請求，或給予正面的支持。所求之事，前景順遂。', emoji: '✓', color: '#4CAF50' },
      laughing: { name: '笑筊', meaning: '【神明一笑 · 誠心再問】 兩陽朝上，陽氣過盛。神明未置可否，或許是您心中已有定見，又或是問題陳述不清、機緣未到。 指引：請平心靜氣，重新將問題說清楚，再次請示。', emoji: '☺', color: '#FF9800' },
      angry: { name: '陰筊', meaning: '【神明不予 · 此路不通】 兩陰朝上，陰氣沈滯。神明表示否定、憤怒，或認為時機不對。 指引：所求之事不可行，宜反躬自省，暫緩腳步。', emoji: '✗', color: '#f44336' }
    };

    // 音樂播放器 (YouTube)
    this.musicBtn = document.getElementById('music-btn');
    this.player = null;
    this.isMusicPlaying = false;
    this.initMusicPlayer();

    this.initThreeJS();
    this.initPhysics();
    this.initEvents();
    this.animate();
  }

  initMusicPlayer() {
    // 載入 YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // 定義 API Ready 回調
    window.onYouTubeIframeAPIReady = () => {
        this.player = new YT.Player('youtube-player-placeholder', {
            height: '200',
            width: '200',
            videoId: '15tVFFGsI1E', // 指定的影片 ID
            playerVars: {
                'playsinline': 1,
                'loop': 1,
                'playlist': '15tVFFGsI1E' // loop 需要 playlist
            },
            events: {
                'onReady': (event) => {
                    console.log('Music player ready');
                    // 預設不自動播放，等待用戶點擊
                },
                'onStateChange': (event) => {
                    // 可以在這裡監聽播放狀態改變
                }
            }
        });
    };

    // 綁定按鈕事件
    if (this.musicBtn) {
        this.musicBtn.addEventListener('click', () => this.toggleMusic());
    }
  }

  toggleMusic() {
    if (!this.player || !this.player.playVideo) return;

    if (this.isMusicPlaying) {
        this.player.pauseVideo();
        this.musicBtn.textContent = '⏵';
        this.musicBtn.classList.remove('playing');
        this.isMusicPlaying = false;
    } else {
        this.player.playVideo();
        this.musicBtn.textContent = '⏸';
        this.musicBtn.classList.add('playing');
        this.isMusicPlaying = true;
    }
  }

  initThreeJS() {
    console.log('Initializing Three.js scene...');

    // 場景
    this.scene = new THREE.Scene();
    this.scene.background = null; // 透明背景

    // 相機（從上方觀看）
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 10, 8); // 斜上方視角
    this.camera.position.set(-0.4, 6.3, 14.0); // 斜上方視角, alternative
    this.camera.lookAt(0, 0, 0);

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // 啟用透明度
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 軌道控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI / 2 * 0.95;

    // 監聽相機變動，輸出資訊以便除錯
    this.controls.addEventListener('change', () => {
        // 為了避免 log 太頻繁，可以考慮只在特定條件下印出，或者直接印出
        // 使用 toFixed(2) 讓數字好讀一點
        /*
        console.log(`Camera Pos: { x: ${this.camera.position.x.toFixed(2)}, y: ${this.camera.position.y.toFixed(2)}, z: ${this.camera.position.z.toFixed(2)} }`);
        console.log(`Target: { x: ${this.controls.target.x.toFixed(2)}, y: ${this.controls.target.y.toFixed(2)}, z: ${this.controls.target.z.toFixed(2)} }`);
        */
       // 暫時註解掉以免洗版，您可以隨時取消註解
       console.log(`Cam: ${this.camera.position.x.toFixed(1)}, ${this.camera.position.y.toFixed(1)}, ${this.camera.position.z.toFixed(1)}`);
    });

    // 光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = false; // 關閉陰影，避免多重影
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, 2);
    this.scene.add(fillLight);

    const spotLight1 = new THREE.SpotLight(0xffffff, 2.5); // 加強亮度
    spotLight1.position.set(-3, 8, -3);
    spotLight1.angle = Math.PI / 6;
    spotLight1.penumbra = 0.3;
    spotLight1.decay = 2;
    spotLight1.distance = 20;
    spotLight1.castShadow = true; // 保留這個作為主陰影源
    this.scene.add(spotLight1);

    const spotLight2 = new THREE.SpotLight(0xffffff, 2.5); // 加強亮度
    spotLight2.position.set(3, 8, 3);
    spotLight2.angle = Math.PI / 6;
    spotLight2.penumbra = 0.3;
    spotLight2.decay = 2;
    spotLight2.distance = 20;
    spotLight2.castShadow = false; // 關閉陰影
    this.scene.add(spotLight2);

    // 新增一個黃色 Spot Light
    const yellowSpotLight = new THREE.SpotLight(0xffff00, 2.0); // 黃光
    yellowSpotLight.position.set(-5, 8, 5); // 從另一個方向照射
    yellowSpotLight.angle = Math.PI / 6;
    yellowSpotLight.penumbra = 0.3;
    yellowSpotLight.decay = 2;
    yellowSpotLight.distance = 20;
    yellowSpotLight.castShadow = false; // 關閉陰影
    this.scene.add(yellowSpotLight);

    // 地面平面 (預設隱藏，但材質改為 ShadowMaterial 只顯示陰影)
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    // 使用 ShadowMaterial 來只渲染半透明陰影
    const groundMaterial = new THREE.ShadowMaterial({
      color: 0x000000, // 陰影顏色 (黑色)
      opacity: 0.3,    // 半透明度 (可以調整深淺)
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.ground.receiveShadow = true;
    this.ground.visible = true; // 永遠顯示 (因為是透明陰影材質)
    this.scene.add(this.ground);

    // 響應式調整
    window.addEventListener('resize', () => this.onWindowResize());

    // 載入 GLB 模型
    this.loadMoonBlockModel();
  }

  initPhysics() {
    console.log('Initializing Cannon.js physics...');

    // 創建物理世界
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0);

    // 使用更好的碰撞檢測算法
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 20;
    this.world.solver.tolerance = 0.001;
    this.world.allowSleep = true;

    // 創建材質
    const groundMaterial = new CANNON.Material('ground');
    const blockMaterial = new CANNON.Material('block');

    // 設置接觸材質 - 降低剛度避免抖動
    const groundBlockContact = new CANNON.ContactMaterial(
      groundMaterial,
      blockMaterial,
      {
        friction: 0.3, // 降低摩擦力避免卡住
        restitution: 0.2,
        contactEquationStiffness: 1e6,  // 降低剛度
        contactEquationRelaxation: 4,   // 增加鬆弛
        frictionEquationStiffness: 1e6,
        frictionEquationRelaxation: 4
      }
    );
    this.world.addContactMaterial(groundBlockContact);
    this.groundBlockContact = groundBlockContact; // 存起來以便修改

    const blockBlockContact = new CANNON.ContactMaterial(
      blockMaterial,
      blockMaterial,
      {
        friction: 0.3, // 降低摩擦力
        restitution: 0.15,
        contactEquationStiffness: 1e6,
        contactEquationRelaxation: 4,
        frictionEquationStiffness: 1e6,
        frictionEquationRelaxation: 4
      }
    );
    this.world.addContactMaterial(blockBlockContact);
    this.blockBlockContact = blockBlockContact; // 存起來以便修改

    this.groundMaterial = groundMaterial;
    this.blockMaterial = blockMaterial;

    // 創建地面物理體
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      material: groundMaterial
    });
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);

    // 創建四面牆壁
    const wallDistance = 3.5;

    const northWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    northWall.position.set(0, 0, -(wallDistance - 1)); // 將北牆(遠處)拉近一點，防止跑太遠 (原本是 -3.5)
    northWall.quaternion.setFromEuler(0, 0, 0);
    this.world.addBody(northWall);

    const southWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    southWall.position.set(0, 0, wallDistance + 1);
    southWall.quaternion.setFromEuler(0, Math.PI, 0);
    this.world.addBody(southWall);

    const westWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    westWall.position.set(-wallDistance, 0, 0);
    westWall.quaternion.setFromEuler(0, Math.PI / 2, 0);
    this.world.addBody(westWall);

    const eastWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    eastWall.position.set(wallDistance, 0, 0);
    eastWall.quaternion.setFromEuler(0, -Math.PI / 2, 0);
    this.world.addBody(eastWall);

    console.log('Physics world initialized');
  }

  loadMoonBlockModel() {
    console.log('Loading moon block GLB model...');
    const loader = new GLTFLoader();

    loader.load(
      moonblockGlb,
      (gltf) => {
        console.log('GLB model loaded successfully:', gltf);
        this.moonblockModel = gltf.scene;

        // 從模型中提取幾何數據 (並校正重心)
        this.extractModelGeometry();

        // 調整模型尺寸
        this.moonblockModel.scale.set(0.8, 0.8, 0.8);

        // 啟用陰影，但保留原始材質
        this.moonblockModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Log 材質名稱以供除錯
            if (child.material) {
                console.log(`Mesh '${child.name}' uses material: '${child.material.name}'`);
            }
          }
        });

        this.modelLoaded = true;
        this.throwBtn.disabled = false;
        this.throwBtn.textContent = '誠心擲筊';
        console.log('Moon block model ready!');
      },
      (progress) => {
        console.log('Loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
      },
      (error) => {
        console.error('Error loading GLB model:', error);
      }
    );
  }

  extractModelGeometry() {
    // 從 GLB 模型中提取實際幾何數據
    const box = new THREE.Box3();
    const meshes = [];

    // 1. 遍歷並收集所有 Mesh，同時計算整體包圍盒
    this.moonblockModel.traverse((child) => {
      if (child.isMesh && child.geometry) {
        meshes.push(child);
        // 確保矩陣是最新的以便計算包圍盒
        child.updateMatrixWorld();
        if (box.isEmpty()) {
          box.setFromObject(child);
        } else {
          box.expandByObject(child);
        }
      }
    });

    // 2. 計算原始中心點
    this.modelBoundingBox = box;
    this.modelCenter = new THREE.Vector3();
    box.getCenter(this.modelCenter);

    console.log('Original Center:', this.modelCenter);

    // 3. 校正幾何中心 (Centering Geometry)
    // 將所有 Mesh 的幾何體頂點移動，使整體中心位於 (0,0,0)
    // 這樣可以確保物理剛體重心 (Center of Mass) 與視覺中心一致，解決浮空或陷入問題
    const offset = this.modelCenter.clone().negate();

    meshes.forEach(mesh => {
      mesh.geometry.translate(offset.x, offset.y, offset.z);
      mesh.geometry.computeBoundingBox(); // 更新幾何體自身的包圍盒
    });

    // 4. 更新類屬性
    if (meshes.length > 0) {
      // 物理引擎通常只取第一個主要 Mesh 的幾何體
      this.modelGeometry = meshes[0].geometry;
    }

    // 更新存儲的包圍盒 (移動到原點)
    this.modelBoundingBox.translate(offset);
    this.modelCenter.set(0, 0, 0);

    // 計算模型尺寸
    const size = new THREE.Vector3();
    this.modelBoundingBox.getSize(size);

    console.log('Geometry centered successfully.');
    console.log('New bounding box:', this.modelBoundingBox);
    console.log('New center:', this.modelCenter);
    console.log('Size:', size);
  }

  createPhysicsShapeFromBoundingBox() {
    // 從實際邊界盒創建物理形狀
    // 避免使用凸多面體，因為 GLB 模型的頂點順序可能不符合 Cannon.js 要求
    if (!this.modelBoundingBox) {
      console.error('No bounding box found, using default shape');
      return new CANNON.Box(new CANNON.Vec3(0.4, 0.4, 0.1));
    }

    const size = new THREE.Vector3();
    this.modelBoundingBox.getSize(size);

    console.log('Model size:', size);

    // 除以 2 因為 Cannon.Box 使用半尺寸（half extents）
    // 並且應用 0.8 的縮放係數以匹配視覺模型
    const halfExtents = new CANNON.Vec3(
      (size.x / 2) * 0.8,
      (size.y / 2) * 0.8,
      (size.z / 2) * 0.8
    );

    console.log('Physics box half extents:', halfExtents);

    return new CANNON.Box(halfExtents);
  }

  createConvexPolyhedron(geometry) {
    // 1. 獲取頂點並進行合併 (Merge Vertices) & 降採樣 (Downsampling)
    const positionAttribute = geometry.attributes.position;
    const vertices = [];
    const keyToId = {};
    const oldIdToNewId = [];
    
    // 為了效能與物理穩定性，我們大幅減少頂點數量
    // 目標是將物理模型的頂點數控制在 100 以內
    // 這會生成一個「低模」的物理凸包，避免卡在細小的面，同時大幅提升 FPS
    const targetVertexCount = 100;
    const stride = Math.max(1, Math.floor(positionAttribute.count / targetVertexCount));
    
    console.log(`Downsampling physics mesh: Total ${positionAttribute.count} points, Stride ${stride}`);

    const getKey = (x, y, z) => {
      const p = 100; // 降低精度以增加合併率 (1cm 精度)
      return `${Math.round(x * p)}_${Math.round(y * p)}_${Math.round(z * p)}`;
    };

    // 遍歷原始頂點
    for (let i = 0; i < positionAttribute.count; i++) {
      // 降採樣：跳過大部分頂點，只取關鍵點
      // 注意：我們仍然需要建立 oldIdToNewId 映射，以防面索引需要它
      // 但對於 ConvexPolyhedron，Cannon 其實會自己重新計算 Hull，所以我們只需要提供點雲即可
      
      if (i % stride !== 0 && i !== positionAttribute.count - 1) {
         oldIdToNewId.push(-1); // 標記為被忽略
         continue; 
      }

      // 應用縮放 0.8
      const x = positionAttribute.getX(i) * 0.8;
      const y = positionAttribute.getY(i) * 0.8;
      const z = positionAttribute.getZ(i) * 0.8;

      const key = getKey(x, y, z);

      if (keyToId[key] === undefined) {
        keyToId[key] = vertices.length;
        vertices.push(new CANNON.Vec3(x, y, z));
      }
      oldIdToNewId.push(keyToId[key]);
    }

    console.log(`ConvexPolyhedron optimized: ${positionAttribute.count} -> ${vertices.length} vertices`);

    // 3. 創建物理形狀
    // 我們不再嘗試重建原始的面 (Faces)，因為降採樣後原始的面索引已經無效
    // 讓 Cannon.js 使用 QuickHull 演算法自動從點雲生成新的最佳凸包
    const polyhedron = new CANNON.ConvexPolyhedron({
      vertices: vertices,
      // 不傳入 faces，讓 Cannon 自動計算 Hull
    });

    return polyhedron;
  }

  createMoonBlock() {
    const mesh = this.moonblockModel.clone();
    
    // 確保每個實例有獨立的材質，但不強制覆蓋顏色
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });

    return mesh;
  }

  initEvents() {
    this.throwBtn.addEventListener('click', () => this.throw());

    // 運鏡特效開關
    this.floorToggle.addEventListener('change', (e) => {
        this.isCameraEffectEnabled = e.target.checked;
        // 地板現在是 ShadowMaterial，永遠保持開啟以顯示陰影
    });

    this.resultOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideResult();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        if (!this.isThrowing) {
          this.throw();
        }
      } else if (e.key === 'Escape') {
        this.hideResult();
      }
    });
  }

  hideResult() {
    if (!this.isShowingResult) {
      return;
    }
    this.isShowingResult = false;
    this.resultOverlay.classList.remove('show');
    this.resultOverlay.style.display = 'none';
  }
  
  createMoonBlockPolyhedron() {
    // 手動構建一個近似筊杯的物理形狀
    // 形狀設計：一個底面為矩形，頂部為一條線脊的「楔形體/三稜柱變體」
    // 這比 Box 更像筊杯（有圓弧面特徵的近似），且比自動生成的凸包穩定
    
    // 尺寸參數 (根據模型 bounding box 估算)
    const size = new THREE.Vector3();
    if (this.modelBoundingBox) {
      this.modelBoundingBox.getSize(size);
    } else {
      size.set(2.5, 0.8, 1.5); // 默認備用尺寸
    }
    
    // 縮放係數 (配合視覺模型)
    const scale = 0.8;
    const sx = (size.x / 2) * scale; // 半長
    const sy = (size.y / 2) * scale; // 半高
    const sz = (size.z / 2) * scale; // 半寬

    // 頂點定義 (8個點，近似一個切角的長方體/楔形)
    // 我們定義一個類似 "棺材蓋" 或 "梯形柱" 的形狀
    // 底面 (平面) 較寬，頂面 (凸面脊) 較窄且短
    
    const topScaleX = 0.6; // 頂部脊線長度縮放 (兩頭尖)
    const topScaleZ = 0.2; // 頂部寬度縮放 (脊背寬度)

    const vertices = [
      // 底面 4 點 (Flat Base) - Y負方向
      new CANNON.Vec3(-sx, -sy, -sz), // 0: 左後下
      new CANNON.Vec3( sx, -sy, -sz), // 1: 右後下
      new CANNON.Vec3( sx, -sy,  sz), // 2: 右前下
      new CANNON.Vec3(-sx, -sy,  sz), // 3: 左前下

      // 頂面 4 點 (Ridge Top) - Y正方向，向內收縮
      new CANNON.Vec3(-sx * topScaleX, sy, -sz * topScaleZ), // 4: 左後上
      new CANNON.Vec3( sx * topScaleX, sy, -sz * topScaleZ), // 5: 右後上
      new CANNON.Vec3( sx * topScaleX, sy,  sz * topScaleZ), // 6: 右前上
      new CANNON.Vec3(-sx * topScaleX, sy,  sz * topScaleZ), // 7: 左前上
    ];

    // 面索引 (Faces) - 必須逆時針順序 (CCW) 指向法線外側
    // 為了避免 "Non-planar face" 警告，我們將所有四邊形拆成三角形
    // 這樣可以確保每個面都是完美的平面
    const faces = [
      // 底面 (Bottom) - [1, 2, 3], [0, 1, 3] (維持目前正確狀態)
      [1, 2, 3],
      [0, 1, 3],

      // 頂面 (Top) - [6, 5, 4], [7, 6, 4] (維持目前正確狀態)
      [6, 5, 4],
      [7, 6, 4],

      // 後面 (Back) - 翻轉回 [0, 5, 1], [0, 4, 5]
      [0, 5, 1],
      [0, 4, 5],

      // 前面 (Front) - 翻轉回 [2, 7, 3], [2, 6, 7]
      [2, 7, 3],
      [2, 6, 7],

      // 左面 (Left) - 翻轉回 [0, 3, 7], [0, 7, 4]
      [0, 3, 7],
      [0, 7, 4],

      // 右面 (Right) - 翻轉回 [1, 6, 2], [1, 5, 6]
      [1, 6, 2],
      [1, 5, 6],
    ];

    // 創建凸多面體
    const polyhedron = new CANNON.ConvexPolyhedron({
      vertices: vertices,
      faces: faces
    });

    return polyhedron;
  }

  throw() {
    if (this.isThrowing) return;
    if (!this.modelLoaded) {
      console.log('Model not loaded yet, please wait...');
      return;
    }

    console.log('Throwing moon blocks...');

    this.isThrowing = true;
    this.isFinishing = false;
    this.isRotatingCamera = true; // 開始旋轉相機
    this.throwBtn.disabled = true;
    this.hideResult();
    this.lastTime = null;

    // 將物理參數設定為之前的「正常模式 (Bouncy)」
    this.groundBlockContact.restitution = 0.8;
    this.groundBlockContact.friction = 0.1;
    this.blockBlockContact.restitution = 0.6;

    // 清除舊筊塊
    this.blocks.forEach(block => {
      this.scene.remove(block.mesh);
      if (block.debugBox) {
        this.scene.remove(block.debugBox);
      }
      if (block.body) {
        this.world.removeBody(block.body);
      }
    });
    this.blocks = [];

    // 創建物理形狀 (使用自定義近似多面體)
    const physicsShape = this.createMoonBlockPolyhedron();

    // 創建兩個新筊塊
    for (let i = 0; i < 2; i++) {
      // 不再預設 isFlatUp
      const mesh = this.createMoonBlock();

      const startX = (i === 0 ? -1.5 : 1.5);
      const startY = 5;
      const startZ = 2.0 + (Math.random() - 0.5) * 1; // 往螢幕方向(Z軸正向)拉近 2.0 單位

      mesh.position.set(startX, startY, startZ);
      // 完全隨機旋轉
      mesh.rotation.x = Math.random() * Math.PI * 2;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.rotation.z = Math.random() * Math.PI * 2;

      this.scene.add(mesh);

      // 偏移修正：假設模型原點在幾何中心，無需額外偏移
      // 如果發現物理體跟 Mesh 對不上，需要調整這裡
      // 目前假設 GLTF Loader 載入後的幾何中心就是 (0,0,0)

      const body = new CANNON.Body({
        mass: 1, // 質量
        shape: physicsShape,
        material: this.blockMaterial,
        position: new CANNON.Vec3(startX, startY, startZ),
        linearDamping: 0.4,
        angularDamping: 0.4,
        sleepSpeedLimit: 0.1,
        sleepTimeLimit: 0.5
      });

      body.quaternion.setFromEuler(
        mesh.rotation.x,
        mesh.rotation.y,
        mesh.rotation.z
      );

      body.velocity.set(
        (Math.random() - 0.5) * 4, // 增加水平擴散
        (Math.random() * 2) + 2,   // 給一點向上的初速
        (Math.random() - 0.5) * 4
      );

      body.angularVelocity.set(
        (Math.random() - 0.5) * 30, // 增加旋轉
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30
      );

      // 監聽碰撞事件播放音效
      body.addEventListener('collide', (e) => {
          this.handleCollision(e);
      });

      this.world.addBody(body);

      // 初始化每個 Body 的音效狀態
      // 每個筊杯在一次擲筊中只播放一次完整音效
      body.hasPlayedSound = false;
      // console.log(`Created body ${body.id}, hasPlayedSound: ${body.hasPlayedSound}`);

      this.blocks.push({
        mesh,
        body,
        settled: false,
        // isFlatUp 將在靜止後計算
      });
    }

    this.simulationStartTime = Date.now();
  }

  handleCollision(e) {
    // e.target 是發出事件的物體 (筊杯自己)
    // e.body 是被撞擊的物體 (地面或另一個筊杯)
    const body = e.target; 
    const relativeVelocity = e.contact.getImpactVelocityAlongNormal();

    // console.log(`Collision: Body ${body.id}, hasPlayed: ${body.hasPlayedSound}, Vel: ${relativeVelocity.toFixed(2)}`);

    // 如果已經播放過音效，就略過
    if (body.hasPlayedSound) return;

    // 必須是足夠強力的第一次撞擊才觸發
    if (Math.abs(relativeVelocity) < 1.0) return;

    // 標記為已播放
    body.hasPlayedSound = true;

    // 隨機選擇一個音效播放
    const idx = Math.floor(Math.random() * this.sounds.length);
    const baseAudio = this.sounds[idx];
    
    // 直接創建新的 Audio 實例以確保播放
    const audio = new Audio(baseAudio.src);
    
    // 固定音量，或只做微小隨機
    // 因為錄音本身已經包含了動態變化
    audio.volume = 0.8 + Math.random() * 0.2;

    // 輕微的音高變化讓兩次聲音聽起來不同
    audio.playbackRate = 0.95 + Math.random() * 0.1;

    // console.log('Playing sound:', baseAudio.src);
    audio.play().catch(e => console.log('Audio play failed:', e));
  }

  updatePhysics() {
    if (!this.isThrowing || this.isFinishing) return;

    const timeStep = 1 / 60;
    const maxSubSteps = 5; // 增加子步數以提高穩定性

    if (!this.lastTime) {
      this.lastTime = Date.now();
    }
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.world.step(timeStep, deltaTime, maxSubSteps);

    let allSettled = true;

    this.blocks.forEach(block => {
      if (block.settled) return;

      // 同步
      block.mesh.position.copy(block.body.position);
      block.mesh.quaternion.copy(block.body.quaternion);

      const linearSpeed = block.body.velocity.length();
      const angularSpeed = block.body.angularVelocity.length();
      
      // 檢查是否立起來 (Edge Standing Check)
      // 假設模型平面朝向 Local -Y (依據之前的 rotation.x = PI 邏輯)
      const flatNormal = new CANNON.Vec3(0, -1, 0); 
      const worldNormal = new CANNON.Vec3();
      block.body.quaternion.vmult(flatNormal, worldNormal);
      
      // 計算與 World Up (0, 1, 0) 的點積
      // 1 = 平面朝上 (陰/Flat Up), -1 = 平面朝下 (凸面朝上), 0 = 立著
      const upDot = worldNormal.dot(new CANNON.Vec3(0, 1, 0));
      
      // 如果速度很慢，且處於側立狀態 (|dot| < 0.3)，給它推一把
      if (linearSpeed < 0.2 && angularSpeed < 0.5 && Math.abs(upDot) < 0.3 && block.body.position.y < 0.5) {
         console.log('Edge standing detected, nudging...');
         // 施加一個隨機小推力
         block.body.applyImpulse(
           new CANNON.Vec3((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5),
           new CANNON.Vec3(0, 0.2, 0) // 推上面一點
         );
         block.body.wakeUp(); // 喚醒
         block.settledTime = null;
         allSettled = false;
         return;
      }

      if ((block.body.sleepState === CANNON.Body.SLEEPING) ||
          (linearSpeed < 0.05 && angularSpeed < 0.05 && block.body.position.y < 0.3)) {
        if (!block.settledTime) {
          block.settledTime = Date.now();
        } else if (Date.now() - block.settledTime > 300) { // 縮短確認時間
          block.settled = true;
          
          // 計算最終狀態
          // Recalculate dot for final state
          block.body.quaternion.vmult(flatNormal, worldNormal);
          const finalDot = worldNormal.dot(new CANNON.Vec3(0, 1, 0));
          
          // Dot > 0 代表平面大致朝上 (平)
          // Dot < 0 代表平面大致朝下 (凸)
          block.isFlatUp = finalDot > 0;
          console.log(`Block settled. Dot: ${finalDot}, Result: ${block.isFlatUp ? 'Flat Up' : 'Convex Up'}`);

          block.body.velocity.set(0, 0, 0);
          block.body.angularVelocity.set(0, 0, 0);
          block.body.sleep();
        }
      } else {
        block.settledTime = null;
        allSettled = false;
      }
    });

    const elapsed = Date.now() - this.simulationStartTime;
    if (!this.isFinishing && (allSettled || elapsed > 8000)) {
      this.isFinishing = true;
      this.finishThrow();
    }
  }

  finishThrow() {
    this.isRotatingCamera = false; // 在結果動畫開始前停止相機旋轉

    // 強制結算任何還沒停下的
    this.blocks.forEach(block => {
      if (!block.settled || block.isFlatUp === undefined) {
        const flatNormal = new CANNON.Vec3(0, -1, 0);
        const worldNormal = new CANNON.Vec3();
        block.body.quaternion.vmult(flatNormal, worldNormal);
        const finalDot = worldNormal.dot(new CANNON.Vec3(0, 1, 0));
        block.isFlatUp = finalDot > 0;
      }
      
      if (block.body) {
        this.world.removeBody(block.body);
        block.body = null;
      }
    });

    const duration = 1000; // 稍微放慢動畫
    const startTime = Date.now();

    // 計算相機前方的位置
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir); // 獲取相機視線方向
    
    // 計算目標中心點：相機前方固定距離
    const displayDist = 4;
    const targetCenter = this.camera.position.clone().add(cameraDir.multiplyScalar(displayDist));

    // 計算相機的"右"向量，用於分開兩個筊塊
    const cameraUp = this.camera.up.clone();
    const cameraRight = new THREE.Vector3().crossVectors(cameraDir, cameraUp).normalize();

    // 準備起始和目標狀態
    const startStates = this.blocks.map(block => ({
      pos: block.mesh.position.clone(),
      quat: block.mesh.quaternion.clone()
    }));

    const targetStates = this.blocks.map((block, index) => {
      // 計算位置偏移
      const offsetDir = index === 0 ? -1 : 1; // 左或右
      const offset = cameraRight.clone().multiplyScalar(offsetDir * 0.6); // 間距 1.2
      const targetPos = targetCenter.clone().add(offset);

      // 計算目標旋轉 (面向相機 + 展示角度)
      const dummy = new THREE.Object3D();
      dummy.position.copy(targetPos);
      dummy.lookAt(this.camera.position);
      
      // 在面向相機的基礎上，進行展示角度的旋轉
      // X軸旋轉 45度展示斜面
      // 如果是平面朝上(isFlatUp)，則額外旋轉 180度
      // 注意：這裡的邏輯依賴於模型的初始朝向。
      // 假設模型默認 Flat Down (Convex Up)。
      // 若要展示 Flat Up，需轉 180 (X軸)。
      // 若要展示 Convex Up，需轉 0。
      // 加上 45 度傾斜方便觀看。
      
      const baseRotation = block.isFlatUp ? Math.PI : 0;
      dummy.rotateX(baseRotation + Math.PI / 4);
      
      return {
        pos: targetPos,
        quat: dummy.quaternion.clone()
      };
    });

    const animateToCenter = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 緩動函數 easeInOutCubic
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.blocks.forEach((block, index) => {
        const start = startStates[index];
        const target = targetStates[index];

        // 插值位置
        block.mesh.position.lerpVectors(start.pos, target.pos, eased);

        // 插值旋轉 (Quaternion slerp)
        block.mesh.quaternion.slerpQuaternions(start.quat, target.quat, eased);
      });

      if (progress < 1) {
        requestAnimationFrame(animateToCenter);
      } else {
        setTimeout(() => {
          this.showResult();
        }, 300);
      }
    };

    animateToCenter();
  }

  showResult() {
    if (this.isShowingResult) {
      return;
    }
    this.isShowingResult = true;

    const [block1, block2] = this.blocks;

    let resultType;
    if (block1.isFlatUp && block2.isFlatUp) {
      resultType = 'laughing'; // 修正: 兩面凸面朝上 (isFlatUp=true) -> 笑筊
    } else if (!block1.isFlatUp && !block2.isFlatUp) {
      resultType = 'angry';     // 修正: 兩面平面朝上 (!isFlatUp=true) -> 陰筊
    } else {
      resultType = 'holy';
    }

    const result = this.results[resultType];

    // 更新統計數據
    if (resultType in this.stats) {
        this.stats[resultType]++;
    }
    this.updateStatsDisplay();

    const overlay = this.resultOverlay;
    overlay.querySelector('.result-emoji').textContent = result.emoji;
    overlay.querySelector('.result-emoji').style.fontSize = ''; // 還原樣式
    overlay.querySelector('.result-emoji').style.lineHeight = '';
    overlay.querySelector('.result-name').textContent = result.name;
    overlay.querySelector('.result-name').style.color = result.color;
    overlay.querySelector('.result-meaning').textContent = result.meaning;

    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('show');

    this.isThrowing = false;
    this.isRotatingCamera = false; // 停止相機旋轉
    this.throwBtn.disabled = false;
  }

  updateStatsDisplay() {
    this.countHoly.textContent = this.stats.holy;
    this.countLaughing.textContent = this.stats.laughing;
    this.countAngry.textContent = this.stats.angry;
  }

  onWindowResize() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // 更新相機旋轉 (僅在特效開啟時)
    if (this.isRotatingCamera && this.isCameraEffectEnabled) {
      this.cameraAngle += 0.005; // 旋轉速度
      const radius = 12.8; // sqrt(10^2 + 8^2) approx, 或者保持水平半徑 8
      const height = 10;
      const dist = 8;
      
      // 繞 Y 軸旋轉
      // 初始位置 (0, 10, 8) 對應 angle = 0 (sin=0, cos=1)
      this.camera.position.x = dist * Math.sin(this.cameraAngle);
      this.camera.position.z = dist * Math.cos(this.cameraAngle);
      this.camera.lookAt(0, 0, 0);
    }

    this.updatePhysics();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new MoonBlocks();
});
