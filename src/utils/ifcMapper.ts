import { BIMObject, CADEntity } from '../types';

/**
 * Utility to map legacy CADEntity (with deprecated bim* fields)
 * to a structured IFC-compliant BIMObject.
 */
export function mapLegacyDataToBIMObject(entity: CADEntity): BIMObject | undefined {
  // If already structured, just return it
  if (entity.bimData) {
    return entity.bimData;
  }

  // Check if legacy data exists
  const legacyData = (entity as any);
  if (!legacyData.bimFamily && !legacyData.bimType) {
    return undefined;
  }

  // Map legacy fields to new IFC structure
  const bimData: BIMObject = {
    guid: entity.id || Math.random().toString(36).substring(2, 9),
    ifc_class: mapLegacyTypeToIfc(legacyData.bimType || legacyData.bimFamily),
    identity: {
      name: legacyData.bimName || 'Untitled Object',
      description: legacyData.bimDescription || '',
    },
    geometry_parameters: {
      height: legacyData.bimHeight,
      width: legacyData.bimWidth,
      windowHeight: legacyData.bimWindowHeight,
      offset: legacyData.bimOffset,
      rotation: legacyData.rotation || 0,
    },
    properties: {
      dimensions: {
        thickness: legacyData.bimThickness || 0,
        width: legacyData.bimWidth,
        height: legacyData.bimHeight,
      },
      analytical: {
        trasmittanza: legacyData.bimTrasmittanza,
        marmo: legacyData.bimMarmo,
      },
      cost_5d: {
        prezzario: legacyData.bimPrezzario || '',
      },
      facility_7d: {
        hatchPattern: legacyData.bimHatchPattern,
      },
    },
    relations: [],
  };

  return bimData;
}

function mapLegacyTypeToIfc(type: string | undefined): string {
  if (!type) return 'IfcBuildingElementProxy';
  switch (type.toLowerCase()) {
    case 'wall': return 'IfcWall';
    case 'door': return 'IfcDoor';
    case 'window': return 'IfcWindow';
    case 'room': return 'IfcSpace';
    default: return 'IfcBuildingElementProxy';
  }
}
