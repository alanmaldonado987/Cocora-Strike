// client/js/world/aircraft.js
// Avión de transporte (AC-130 / CH-47): modelos, cabina y asientos, secuencia de desembarco y seguimiento suavizado
// de la posición del servidor.

import * as THREE from 'three';
import { buildAC130Transport } from '/Modelos%203D/ac130Transport.js';
import { buildCH47Transport } from '/Modelos%203D/ch47Transport.js';
import { _tmpVecA, _tmpVecB, _yAxis } from './common.js';

export const aircraftMethods = {
  resetPlaneTracking(planeState) {
    if (!planeState) {
      this.planeInitialized = false;
      return;
    }
    if (planeState.aircraftType) {
      this.setActiveAircraft(planeState.aircraftType);
    }
    this.getActiveAircraftRig()?.resetFlight();
    this.planeServerPredPos.set(planeState.x, planeState.y, planeState.z);
    this.planeSmoothPos.set(planeState.x, planeState.y, planeState.z);
    this.planeVelocity.set(planeState.vx || 0, 0, planeState.vz || 0);
    this.planeSmoothYaw = planeState.yaw || 0;
    this.planeSmoothQuat.setFromAxisAngle(_yAxis, this.planeSmoothYaw);
    this.lastPlaneServerRef = planeState;
    this.planeInitialized = true;

    this.planeMesh.position.copy(this.planeSmoothPos);
    this.planeMesh.quaternion.copy(this.planeSmoothQuat);
    this.planeMesh.updateMatrixWorld(true);
  },

  createPlaneModel() {
    const g = new THREE.Group();
    const addAnchor = this.addLightAnchor.bind(this);
    const ac130 = buildAC130Transport(addAnchor);
    const ch47 = buildCH47Transport(addAnchor);
    ch47.group.visible = false;
    g.add(ac130.group, ch47.group);
    this.aircraftRigs = { ac130, ch47 };
    this.activeAircraftId = 'ac130';
    return g;
  },

  setActiveAircraft(typeId = 'ac130') {
    if (!this.aircraftRigs) return;
    const nextId = typeId === 'ch47' ? 'ch47' : 'ac130';
    const prevRig = this.aircraftRigs[this.activeAircraftId];
    const nextRig = this.aircraftRigs[nextId];
    const changed = this.activeAircraftId !== nextId;
    this.activeAircraftId = nextId;
    this.aircraftRigs.ac130.group.visible = nextId === 'ac130';
    this.aircraftRigs.ch47.group.visible = nextId === 'ch47';
    if (changed && nextRig) {
      nextRig.resetFlight();
      if (prevRig?.cabinBayGroup && nextRig.cabinBayGroup) {
        while (prevRig.cabinBayGroup.children.length > 0) {
          nextRig.cabinBayGroup.add(prevRig.cabinBayGroup.children[0]);
        }
      }
    }
  },

  getActiveAircraftRig() {
    return this.aircraftRigs?.[this.activeAircraftId] || this.aircraftRigs?.ac130 || null;
  },

  getActiveCabinBayGroup() {
    return this.getActiveAircraftRig()?.cabinBayGroup || this.planeMesh;
  },

  sampleCabinDisembarkLocalPose(seatIndex = 0, normProgress = 0) {
    const rig = this.getActiveAircraftRig();
    if (rig) return rig.sampleDisembarkLocalPose(seatIndex, normProgress);
    return { x: 0, y: -1.14, z: 0, yaw: Math.PI, phase: 'sit', standBlend: 0, walkCycle: 0 };
  },

  getCabinSeatTransform(seatIndex = 0) {
    const rig = this.getActiveAircraftRig();
    const localSeat = rig
      ? rig.getSeatLocalPose(seatIndex)
      : {
          x: (seatIndex % 2 === 0 ? -1 : 1) * 1.32,
          y: -1.14,
          z: 4.2 - (Math.floor(seatIndex / 2) % 6) * 1.72,
          yaw: seatIndex % 2 === 0 ? Math.PI / 2 : -Math.PI / 2
        };
    _tmpVecA.set(localSeat.x, localSeat.y, localSeat.z);
    _tmpVecA.applyMatrix4(this.planeMesh.matrixWorld);

    return {
      x: _tmpVecA.x,
      y: _tmpVecA.y,
      z: _tmpVecA.z,
      yaw: this.planeSmoothYaw + localSeat.yaw,
      roll: this.planeMesh.rotation.z,
      pitch: this.planeMesh.rotation.x
    };
  },

  getPlaneSmoothAnchor(localOffsetX = 0, localOffsetY = 0, localOffsetZ = 0, outVec = null) {
    const target = outVec || _tmpVecB;
    target.set(localOffsetX, localOffsetY, localOffsetZ);
    return target.applyMatrix4(this.planeMesh.matrixWorld);
  }
};
