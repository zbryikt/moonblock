// ES Module imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

// 3D 擲筊類 (使用 Three.js + Cannon.js)
class MoonBlocks {
  constructor() {
    this.throwBtn = document.getElementById('throw-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.historyList = document.getElementById('history-list');
    this.historyCount = document.getElementById('history-count');
    this.container = document.getElementById('canvas-container');
    this.resultOverlay = document.getElementById('result-overlay');

    this.isThrowing = false;
    this.history = [];
    this.blocks = [];
    this.moonblockModel = null;
    this.modelLoaded = false;
    this.isShowingResult = false;
    this.isFinishing = false;

    this.results = {
      holy: { name: '聖筊', meaning: '神明同意，吉', emoji: '✓', color: '#4CAF50' },
      laughing: { name: '笑筊', meaning: '神明發笑，不算', emoji: '☺', color: '#FF9800' },
      angry: { name: '陰筊', meaning: '神明不同意，凶', emoji: '✗', color: '#f44336' }
    };

    this.initThreeJS();
    this.initPhysics();
    this.initEvents();
    this.animate();
  }

  initThreeJS() {
    console.log('Initializing Three.js scene...');

    // 場景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfafafa);

    console.log('Scene created');

    // 相機（正鳥瞰視角，從正上方往下看）
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 軌道控制器（滑鼠拖曳旋轉）
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;  // 開啟阻尼（慣性）
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;     // 允許縮放
    this.controls.enablePan = true;      // 允許平移
    this.controls.minDistance = 3;       // 最近距離
    this.controls.maxDistance = 15;      // 最遠距離
    this.controls.maxPolarAngle = Math.PI / 2 * 0.95;  // 限制不能轉到底板下方

    // 光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // 主光源（從上方斜照）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 5, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    this.scene.add(directionalLight);

    // 補光（從側面）
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 2, 5);
    this.scene.add(fillLight);

    // 聚光燈（從上方打光，增強立體感）
    const spotLight1 = new THREE.SpotLight(0xffffff, 1.5);
    spotLight1.position.set(-3, -3, 8);
    spotLight1.angle = Math.PI / 6;
    spotLight1.penumbra = 0.3;
    spotLight1.decay = 2;
    spotLight1.distance = 20;
    spotLight1.castShadow = true;
    this.scene.add(spotLight1);

    const spotLight2 = new THREE.SpotLight(0xffffff, 1.5);
    spotLight2.position.set(3, 3, 8);
    spotLight2.angle = Math.PI / 6;
    spotLight2.penumbra = 0.3;
    spotLight2.decay = 2;
    spotLight2.distance = 20;
    spotLight2.castShadow = true;
    this.scene.add(spotLight2);

    // 地面平面（淺灰色底板）
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      roughness: 0.8,
      metalness: 0.1
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = 0;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 四面隱形牆壁（防止筊彈出）
    const wallHeight = 10;
    const wallMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });

    // 定義牆壁範圍
    this.wallBounds = 3.5;

    // 北牆
    const northWall = new THREE.Mesh(
      new THREE.PlaneGeometry(10, wallHeight),
      wallMaterial
    );
    northWall.position.set(0, -this.wallBounds, wallHeight / 2);
    northWall.rotation.x = Math.PI / 2;
    this.scene.add(northWall);

    // 南牆
    const southWall = new THREE.Mesh(
      new THREE.PlaneGeometry(10, wallHeight),
      wallMaterial
    );
    southWall.position.set(0, this.wallBounds, wallHeight / 2);
    southWall.rotation.x = Math.PI / 2;
    this.scene.add(southWall);

    // 西牆
    const westWall = new THREE.Mesh(
      new THREE.PlaneGeometry(10, wallHeight),
      wallMaterial
    );
    westWall.position.set(-this.wallBounds, 0, wallHeight / 2);
    westWall.rotation.y = Math.PI / 2;
    westWall.rotation.z = Math.PI / 2;
    this.scene.add(westWall);

    // 東牆
    const eastWall = new THREE.Mesh(
      new THREE.PlaneGeometry(10, wallHeight),
      wallMaterial
    );
    eastWall.position.set(this.wallBounds, 0, wallHeight / 2);
    eastWall.rotation.y = Math.PI / 2;
    eastWall.rotation.z = Math.PI / 2;
    this.scene.add(eastWall);

    // 響應式調整
    window.addEventListener('resize', () => this.onWindowResize());

    // 載入 GLB 模型
    this.loadMoonBlockModel();
  }

  initPhysics() {
    console.log('Initializing Cannon.js physics...');

    // 創建物理世界
    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, -8); // 降低重力，讓運動更柔和

    // 使用更好的碰撞檢測算法
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 30; // 大幅增加迭代次數提高穩定性
    this.world.solver.tolerance = 0.001; // 降低容差提高精度

    // 允許物體睡眠以提高性能和穩定性
    this.world.allowSleep = true;

    // 創建材質
    const groundMaterial = new CANNON.Material('ground');
    const blockMaterial = new CANNON.Material('block');

    // 設置接觸材質（地面與筊塊的碰撞參數）
    const groundBlockContact = new CANNON.ContactMaterial(
      groundMaterial,
      blockMaterial,
      {
        friction: 0.8,        // 增加摩擦力
        restitution: 0.2,     // 降低彈性（減少反彈）
        contactEquationStiffness: 1e6,  // 大幅降低剛度避免抖動
        contactEquationRelaxation: 4,   // 增加鬆弛
        frictionEquationStiffness: 1e6,
        frictionEquationRelaxation: 4
      }
    );
    this.world.addContactMaterial(groundBlockContact);

    // 筊塊之間的碰撞
    const blockBlockContact = new CANNON.ContactMaterial(
      blockMaterial,
      blockMaterial,
      {
        friction: 0.5,
        restitution: 0.1,     // 降低彈性
        contactEquationStiffness: 1e6,
        contactEquationRelaxation: 4,
        frictionEquationStiffness: 1e6,
        frictionEquationRelaxation: 4
      }
    );
    this.world.addContactMaterial(blockBlockContact);

    // 設置默認接觸材質（作為後備）
    this.world.defaultContactMaterial.friction = 0.6;
    this.world.defaultContactMaterial.restitution = 0.2;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e6;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;

    this.groundMaterial = groundMaterial;
    this.blockMaterial = blockMaterial;

    // 創建地面物理體（平面）
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0, // 質量為 0 表示靜態物體
      shape: groundShape,
      material: groundMaterial
    });
    // Cannon.js 中平面默認垂直，需要旋轉到水平
    // 繞 X 軸旋轉 -90 度
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);

    // 創建四面牆壁
    const wallHeight = 5;
    const wallDistance = 3.5;

    // 北牆
    const northWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    northWall.position.set(0, -wallDistance, 0);
    northWall.quaternion.setFromEuler(0, 0, 0);
    this.world.addBody(northWall);

    // 南牆
    const southWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    southWall.position.set(0, wallDistance, 0);
    southWall.quaternion.setFromEuler(0, Math.PI, 0);
    this.world.addBody(southWall);

    // 西牆
    const westWall = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    westWall.position.set(-wallDistance, 0, 0);
    westWall.quaternion.setFromEuler(0, Math.PI / 2, 0);
    this.world.addBody(westWall);

    // 東牆
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
      moonblockGlb,  // 從 moonblock-data.js 引入的 base64 GLB
      (gltf) => {
        console.log('GLB model loaded successfully:', gltf);
        this.moonblockModel = gltf.scene;

        // 調整模型尺寸和方向
        this.moonblockModel.scale.set(0.8, 0.8, 0.8);

        // 啟用陰影並上色
        this.moonblockModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // 給模型上紅色，增強反光
            if (child.material) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xcc3333,
                roughness: 0.3,  // 降低粗糙度，增加反光
                metalness: 0.4,  // 提高金屬度，增加光澤
                side: THREE.DoubleSide
              });
            }
          }
        });

        this.modelLoaded = true;
        this.throwBtn.disabled = false;
        this.throwBtn.textContent = '擲筊';
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

  createMoonBlock(isFlatUp) {
    // Clone 預載的 GLB 模型
    const mesh = this.moonblockModel.clone();

    // 深拷貝材質，給每個 block 不同的材質實例
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();

        // 根據正反面給不同的顏色
        // 平面朝上：深紅色
        // 凸面朝上：淺紅色（橘紅）
        if (isFlatUp) {
          child.material.color.setHex(0xaa1111);  // 深紅
        } else {
          child.material.color.setHex(0xff5555);  // 淺紅/橘紅
        }
      }
    });

    // 根據 isFlatUp 調整初始方向
    // 如果 isFlatUp 為 true，則翻轉模型
    if (isFlatUp) {
      mesh.rotation.x = Math.PI;
    }

    return mesh;
  }

  initEvents() {
    this.throwBtn.addEventListener('click', () => this.throw());
    this.resetBtn.addEventListener('click', () => this.reset());

    // 點擊結果 overlay 隱藏
    this.resultOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideResult();
    }, { once: false });

    // 鍵盤事件
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        if (!this.isThrowing) {
          this.throw();
        }
      } else if ((e.key === 'r' || e.key === 'R') && this.history.length > 0) {
        e.preventDefault();
        this.reset();
      } else if (e.key === 'Escape') {
        this.hideResult();
      }
    });
  }

  hideResult() {
    // 避免重複隱藏
    if (!this.isShowingResult) {
      return;
    }
    this.isShowingResult = false;
    this.resultOverlay.classList.remove('show');
    this.resultOverlay.style.display = 'none';
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
    this.throwBtn.disabled = true;
    this.hideResult(); // 隱藏之前的結果
    this.lastTime = null; // 重置時間

    // 清除舊筊塊
    this.blocks.forEach(block => {
      this.scene.remove(block.mesh);
      if (block.body) {
        this.world.removeBody(block.body);
      }
    });
    this.blocks = [];
    console.log('Old blocks removed');

    // 創建兩個新筊塊
    for (let i = 0; i < 2; i++) {
      const isFlatUp = Math.random() < 0.5;
      console.log(`Creating moon block ${i + 1}, flatUp: ${isFlatUp}`);
      const mesh = this.createMoonBlock(isFlatUp);
      console.log('Moon block created:', mesh);

      // 初始位置（從高處掉落，避免一開始就在地面裡）
      const startX = (i === 0 ? -1.5 : 1.5);
      const startY = (Math.random() - 0.5) * 1;
      const startZ = 5;  // 提高到 5，確保完全在空中

      mesh.position.set(startX, startY, startZ);

      // 隨機旋轉
      mesh.rotation.x = Math.random() * Math.PI * 2;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.rotation.z = Math.random() * Math.PI * 2;

      this.scene.add(mesh);

      // 創建物理體（使用盒子形狀近似筊塊）
      // 使用更小更扁平的盒子，更接近筊塊的實際形狀
      const boxShape = new CANNON.Box(new CANNON.Vec3(0.2, 0.1, 0.05));
      const body = new CANNON.Body({
        mass: 0.5, // 增加質量讓它更穩定
        shape: boxShape,
        material: this.blockMaterial,
        position: new CANNON.Vec3(startX, startY, startZ),
        linearDamping: 0.5,  // 大幅增加阻尼
        angularDamping: 0.5,  // 大幅增加角阻尼
        sleepSpeedLimit: 0.05,  // 更容易進入睡眠
        sleepTimeLimit: 0.3    // 更快睡眠
      });

      // 設置初始旋轉
      body.quaternion.setFromEuler(
        mesh.rotation.x,
        mesh.rotation.y,
        mesh.rotation.z
      );

      // 給一個較小的隨機初速度（更像真實拋擲）
      body.velocity.set(
        (Math.random() - 0.5) * 2,   // 降低橫向速度
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 0.5  // 給一點向下的初速
      );

      // 隨機角速度（降低旋轉速度）
      body.angularVelocity.set(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      );

      this.world.addBody(body);

      this.blocks.push({
        mesh,
        body,
        isFlatUp,
        settled: false
      });
    }

    // 開始物理模擬
    this.simulationStartTime = Date.now();
  }

  updatePhysics() {
    if (!this.isThrowing) return;

    // 更新物理世界（使用更小的時間步長提高精度）
    const timeStep = 1 / 120;  // 更小的時間步長
    const maxSubSteps = 5;     // 最多子步驟

    if (!this.lastTime) {
      this.lastTime = Date.now();
    }
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.world.step(timeStep, deltaTime, maxSubSteps);

    // 同步物理體位置到 Three.js mesh
    let allSettled = true;

    this.blocks.forEach(block => {
      if (block.settled) return;

      // 從物理 body 同步位置到 mesh
      block.mesh.position.copy(block.body.position);
      block.mesh.quaternion.copy(block.body.quaternion);

      // 檢查是否靜止（使用 Cannon.js 的睡眠機制或手動檢查）
      const linearSpeed = block.body.velocity.length();
      const angularSpeed = block.body.angularVelocity.length();
      const isNearGround = block.body.position.z < 0.3;

      // 使用更寬鬆的條件判斷靜止
      if ((block.body.sleepState === CANNON.Body.SLEEPING) ||
          (linearSpeed < 0.08 && angularSpeed < 0.08 && isNearGround)) {
        // 物體已經靜止
        if (!block.settledTime) {
          block.settledTime = Date.now();
        } else if (Date.now() - block.settledTime > 600) {
          // 靜止超過 0.6 秒，確認為真正靜止
          block.settled = true;
          block.body.velocity.set(0, 0, 0);
          block.body.angularVelocity.set(0, 0, 0);
          block.body.sleep(); // 強制進入睡眠狀態
        }
      } else {
        block.settledTime = null;
        allSettled = false;
      }
    });

    // 檢查是否全部靜止或超時
    const elapsed = Date.now() - this.simulationStartTime;
    if (!this.isFinishing && (allSettled || elapsed > 6000)) {
      this.isFinishing = true;
      this.finishThrow();
    }
  }

  finishThrow() {
    // 停止所有運動並移除物理控制
    this.blocks.forEach(block => {
      if (block.body) {
        block.body.velocity.set(0, 0, 0);
        block.body.angularVelocity.set(0, 0, 0);
        block.settled = true;
        // 移除物理 body，改由動畫控制
        this.world.removeBody(block.body);
        block.body = null; // 清除引用
      }
    });

    // 動畫：移動到中心並排顯示
    const duration = 800;
    const startTime = Date.now();

    const startPositions = this.blocks.map(block => ({
      x: block.mesh.position.x,
      y: block.mesh.position.y,
      z: block.mesh.position.z,
      rotX: block.mesh.rotation.x,
      rotY: block.mesh.rotation.y,
      rotZ: block.mesh.rotation.z
    }));

    // 目標位置：中心並排，左右各 1 單位
    // z 設為 0.15 讓筊塊站在地面上，而不是嵌入地面（地面在 z = 0）
    const targetPositions = [
      { x: -1.2, y: 0, z: 0.15 },
      { x: 1.2, y: 0, z: 0.15 }
    ];

    const animateToCenter = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 使用 easeInOutCubic 緩動函數
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.blocks.forEach((block, index) => {
        const start = startPositions[index];
        const target = targetPositions[index];

        // 位置插值
        block.mesh.position.x = start.x + (target.x - start.x) * eased;
        block.mesh.position.y = start.y + (target.y - start.y) * eased;
        block.mesh.position.z = start.z + (target.z - start.z) * eased;

        // 旋轉到正確朝向（平放，顯示正確的面）
        // Z 軸旋轉歸零，讓筊水平擺放
        let targetRotZ = 0;

        // 如果是平面朝上，翻轉 180 度（顯示底部深紅色）
        // 如果是凸面朝上，保持 0 度（顯示頂部淺紅色）
        // 加上 45 度斜向用戶
        let targetRotX = (block.isFlatUp ? Math.PI : 0) + Math.PI / 4;

        block.mesh.rotation.x = start.rotX + (targetRotX - start.rotX) * eased;
        block.mesh.rotation.y = start.rotY + (0 - start.rotY) * eased;
        block.mesh.rotation.z = start.rotZ + (targetRotZ - start.rotZ) * eased;
      });

      if (progress < 1) {
        requestAnimationFrame(animateToCenter);
      } else {
        // 動畫結束，延遲一下再顯示結果
        setTimeout(() => {
          this.showResult();
        }, 300);
      }
    };

    animateToCenter();
  }

  showResult() {
    // 避免重複顯示
    if (this.isShowingResult) {
      return;
    }
    this.isShowingResult = true;

    const [block1, block2] = this.blocks;

    let resultType;
    if (block1.isFlatUp && block2.isFlatUp) {
      resultType = 'angry';
    } else if (!block1.isFlatUp && !block2.isFlatUp) {
      resultType = 'laughing';
    } else {
      resultType = 'holy';
    }

    const result = this.results[resultType];

    // 顯示全螢幕結果
    const overlay = this.resultOverlay;
    overlay.querySelector('.result-emoji').textContent = result.emoji;
    overlay.querySelector('.result-name').textContent = result.name;
    overlay.querySelector('.result-name').style.color = result.color;
    overlay.querySelector('.result-meaning').textContent = result.meaning;

    overlay.style.display = 'flex';
    // 強制重繪以觸發動畫
    overlay.offsetHeight;
    overlay.classList.add('show');

    this.addHistory(result);

    this.isThrowing = false;
    this.throwBtn.disabled = false;
    this.resetBtn.style.display = 'inline-flex';
  }

  addHistory(result) {
    const timestamp = new Date();
    this.history.unshift({
      result: result.name,
      emoji: result.emoji,
      color: result.color,
      time: timestamp
    });

    this.updateHistoryDisplay();
  }

  updateHistoryDisplay() {
    this.historyCount.textContent = `${this.history.length} 筆`;

    if (this.history.length === 0) {
      this.historyList.innerHTML = '<div class="empty-message">尚無記錄</div>';
      return;
    }

    const html = this.history
      .map((item, index) => {
        const timeStr = this.formatTime(item.time);
        return `
          <div class="history-item">
            <div class="history-number">#${this.history.length - index}</div>
            <div class="history-result" style="color: ${item.color}">
              ${item.emoji} ${item.result}
            </div>
            <div class="history-time">${timeStr}</div>
          </div>
        `;
      })
      .join('');

    this.historyList.innerHTML = html;
  }

  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  reset() {
    this.blocks.forEach(block => {
      this.scene.remove(block.mesh);
      if (block.body) {
        this.world.removeBody(block.body);
      }
    });
    this.blocks = [];

    this.hideResult();
    this.isFinishing = false;
    this.isThrowing = false;
    this.lastTime = null;
    this.resetBtn.style.display = 'none';
  }

  onWindowResize() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.updatePhysics();
    this.controls.update();  // 更新軌道控制器（阻尼效果）
    this.renderer.render(this.scene, this.camera);
  }
}

// 等待 Three.js 載入後初始化
function init() {
  if (typeof THREE !== 'undefined') {
    new MoonBlocks();
  } else {
    setTimeout(init, 100);
  }
}

document.addEventListener('DOMContentLoaded', init);
