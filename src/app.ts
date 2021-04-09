/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';

/**
 * The structure of a wings entry in the wings database.
 */
type WingsDescriptor = {
	displayName: string;
	resourceName: string;
	scale: {
		x: number;
		y: number;
		z: number;
	};
	rotation: {
		x: number;
		y: number;
		z: number;
	};
	position: {
		x: number;
		y: number;
		z: number;
	};
};

/**
 * The structure of the wings database.
 */
type WingsDatabase = {
	[key: string]: WingsDescriptor;
};

// Load the database of wings .
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WingsDatabase: WingsDatabase = require('../public/wings.json');

/**
 * WearWings Application - Showcasing avatar attachments.
 */
export default class WearWings {
	// Container for preloaded wings prefabs.
	private assets: MRE.AssetContainer;
	private prefabs: { [key: string]: MRE.Prefab } = {};
	// Container for instantiated wings .
	private attachedWingss = new Map<MRE.Guid, MRE.Actor>();

	/**
	 * Constructs a new instance of this class.
	 * @param context The MRE SDK context.
	 * @param baseUrl The baseUrl to this project's `./public` folder.
	 */
	constructor(private context: MRE.Context) {
		this.assets = new MRE.AssetContainer(context);
		// Hook the context events we're interested in.
		this.context.onStarted(() => this.started());
		this.context.onUserLeft(user => this.userLeft(user));
	}

	/**
	 * Called when a Wingss application session starts up.
	 */
	private async started() {
		// Check whether code is running in a debuggable watched filesystem
		// environment and if so delay starting the app by 1 second to give
		// the debugger time to detect that the server has restarted and reconnect.
		// The delay value below is in milliseconds so 1000 is a one second delay.
		// You may need to increase the delay or be able to decrease it depending
		// on the speed of your PC.
		const delay = 1000;
		const argv = process.execArgv.join();
		const isDebug = argv.includes('inspect') || argv.includes('debug');

		// // version to use with non-async code
		// if (isDebug) {
		// 	setTimeout(this.startedImpl, delay);
		// } else {
		// 	this.startedImpl();
		// }

		// version to use with async code
		if (isDebug) {
			await new Promise(resolve => setTimeout(resolve, delay));
			await this.startedImpl();
		} else {
			await this.startedImpl();
		}
	}

	// use () => {} syntax here to get proper scope binding when called via setTimeout()
	// if async is required, next line becomes private startedImpl = async () => {
	private startedImpl = async () => {
		// Preload all the wings models.
		await this.preloadWingss();
		// Show the wings menu.
		this.showWingsMenu();
	}

	/**
	 * Called when a user leaves the application (probably left the Altspace world where this app is running).
	 * @param user The user that left the building.
	 */
	private userLeft(user: MRE.User) {
		// If the user was wearing a wings, destroy it. Otherwise it would be
		// orphaned in the world.
		this.removeWingss(user);
	}

	/**
	 * Show a menu of wings selections.
	 */
	private showWingsMenu() {
		// Create a parent object for all the menu items.
		const menu = MRE.Actor.Create(this.context, {});
		let y = 0.3;

		// Create menu button
		const buttonMesh = this.assets.createBoxMesh('button', 0.3, 0.3, 0.01);

		// Loop over the wings database, creating a menu item for each entry.
		for (const wingsId of Object.keys(WingsDatabase)) {
			// Create a clickable button.
			const button = MRE.Actor.Create(this.context, {
				actor: {
					parentId: menu.id,
					name: wingsId,
					appearance: { meshId: buttonMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: {
						local: { position: { x: 0, y, z: 0 } }
					}
				}
			});

			// Set a click handler on the button.
			button.setBehavior(MRE.ButtonBehavior)
				.onClick(user => this.wearWings(wingsId, user.id));

			// Create a label for the menu entry.
			MRE.Actor.Create(this.context, {
				actor: {
					parentId: menu.id,
					name: 'label',
					text: {
						contents: WingsDatabase[wingsId].displayName,
						height: 0.5,
						anchor: MRE.TextAnchorLocation.MiddleLeft
					},
					transform: {
						local: { position: { x: 0.5, y, z: 0 } }
					}
				}
			});
			y = y + 0.5;
		}

		// Create a label for the menu title.
		MRE.Actor.Create(this.context, {
			actor: {
				parentId: menu.id,
				name: 'label',
				text: {
					contents: ''.padStart(8, ' ') + "Wear a Wings",
					height: 0.8,
					anchor: MRE.TextAnchorLocation.MiddleCenter,
					color: MRE.Color3.Yellow()
				},
				transform: {
					local: { position: { x: 0.5, y: y + 0.25, z: 0 } }
				}
			}
		});
	}

	/**
	 * Preload all wings resources. This makes instantiating them faster and more efficient.
	 */
	private preloadWingss() {
		// Loop over the wings database, preloading each wings resource.
		// Return a promise of all the in-progress load promises. This
		// allows the caller to wait until all wings  are done preloading
		// before continuing.
		return Promise.all(
			Object.keys(WingsDatabase).map(wingsId => {
				const wingsRecord = WingsDatabase[wingsId];
				if (wingsRecord.resourceName) {
					return this.assets.loadGltf(wingsRecord.resourceName)
						.then(assets => {
							this.prefabs[wingsId] = assets.find(a => a.prefab !== null) as MRE.Prefab;
						})
						.catch(e => MRE.log.error("app", e));
				} else {
					return Promise.resolve();
				}
			}));
	}

	/**
	 * Instantiate a wings and attach it to the avatar's head.
	 * @param wingsId The id of the wings in the wings database.
	 * @param userId The id of the user we will attach the wings to.
	 */
	private wearWings(wingsId: string, userId: MRE.Guid) {
		// If the user is wearing a wings, destroy it.
		this.removeWingss(this.context.user(userId));

		const wingsRecord = WingsDatabase[wingsId];

		// If the user selected 'none', then early out.
		if (!wingsRecord.resourceName) {
			return;
		}

		// Create the wings model and attach it to the avatar's head.
		this.attachedWingss.set(userId, MRE.Actor.CreateFromPrefab(this.context, {
			prefab: this.prefabs[wingsId],
			actor: {
				transform: {
					local: {
						position: wingsRecord.position,
						rotation: MRE.Quaternion.FromEulerAngles(
							wingsRecord.rotation.x * MRE.DegreesToRadians,
							wingsRecord.rotation.y * MRE.DegreesToRadians,
							wingsRecord.rotation.z * MRE.DegreesToRadians),
						scale: wingsRecord.scale,
					}
				},
				attachment: {
					attachPoint: 'head',
					userId
				}
			}
		}));
	}

	private removeWingss(user: MRE.User) {
		if (this.attachedWingss.has(user.id)) { this.attachedWingss.get(user.id).destroy(); }
		this.attachedWingss.delete(user.id);
	}
}
