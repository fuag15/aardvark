import { AvNodeTransform, AvNodeType, AvVolume, EndpointAddr, endpointAddrsMatch, ENodeFlags, InitialInterfaceLock, InterfaceLockResult, invertNodeTransform, MessageType, MsgInterfaceLock, MsgInterfaceLockResponse, MsgInterfaceRelock, MsgInterfaceRelockResponse, MsgInterfaceSendEvent, MsgInterfaceSendEventResponse, MsgInterfaceUnlock, MsgInterfaceUnlockResponse, AvConstraint } from '@aardvarkxr/aardvark-shared';
import bind from 'bind-decorator';
import { AvBaseNode, AvBaseNodeProps } from './aardvark_base_node';
import { AvGadget } from './aardvark_gadget';

export enum InterfaceRole
{
	Invalid,
	Transmitter,
	Receiver,
};

export interface ActiveInterface
{
	readonly self: EndpointAddr;
	readonly peer: EndpointAddr;
	readonly interface: string;
	readonly role: InterfaceRole;
	readonly transmitterFromReceiver: AvNodeTransform;
	readonly selfFromPeer: AvNodeTransform;
	readonly params: object;
	lock():Promise<InterfaceLockResult>;
	unlock():Promise<InterfaceLockResult>;
	relock( newReceiver: EndpointAddr ):Promise<InterfaceLockResult>;
	sendEvent( event: object ):Promise<void>;
	onEnded( endedCallback:() => void ): void;
	onEvent( eventCallback:( event: object ) => void ): void;
	onTransformUpdated( transformCallback:( entityFromPeer: AvNodeTransform ) => void ): void;
}


class CActiveInterface implements ActiveInterface
{
	public transmitter: EndpointAddr;
	public receiver: EndpointAddr;
	public iface: string;
	public role: InterfaceRole;
	private endedCallback:() => void;
	private eventCallback:( event: object ) => void;
	private transformCallback:( entityFromPeer: AvNodeTransform ) => void;
	private lastTransmitterFromReceiver: AvNodeTransform;
	public params: object;

	constructor( transmitter: EndpointAddr, receiver: EndpointAddr, iface: string, 
		transmitterFromReceiver: AvNodeTransform, role: InterfaceRole, params?: object )
	{
		this.transmitter = transmitter;
		this.receiver = receiver;
		this.iface = iface;
		this.lastTransmitterFromReceiver = transmitterFromReceiver;
		this.role = role;
		this.params = params;
	}

	public lock(): Promise<InterfaceLockResult>
	{
		return new Promise<InterfaceLockResult>( async (resolve, reject ) =>
		{
			let [ msgResponse ] = await AvGadget.instance().sendMessageAndWaitForResponse<MsgInterfaceLockResponse>(
				MessageType.InterfaceLock, 
				{
					transmitter: this.transmitter,
					receiver: this.receiver,
					iface: this.iface
				} as MsgInterfaceLock,
				MessageType.InterfaceLockResponse );
			resolve( msgResponse.result )
		} );
	}

	public unlock(): Promise<InterfaceLockResult>
	{
		return new Promise<InterfaceLockResult>( async (resolve, reject ) =>
		{
			let [ msgResponse ] = await AvGadget.instance().sendMessageAndWaitForResponse<MsgInterfaceUnlockResponse>(
				MessageType.InterfaceUnlock, 
				{
					transmitter: this.transmitter,
					receiver: this.receiver,
					iface: this.iface
				} as MsgInterfaceUnlock,
				MessageType.InterfaceUnlockResponse );
			resolve( msgResponse.result )
		} );
	}

	public relock( newReceiver: EndpointAddr ): Promise<InterfaceLockResult>
	{
		return new Promise<InterfaceLockResult>( async (resolve, reject ) =>
		{
			let [ msgResponse ] = await AvGadget.instance().sendMessageAndWaitForResponse<MsgInterfaceRelockResponse>(
				MessageType.InterfaceRelock, 
				{
					transmitter: this.transmitter,
					oldReceiver: this.receiver,
					newReceiver,
					iface: this.iface
				} as MsgInterfaceRelock,
				MessageType.InterfaceRelockResponse );
			resolve( msgResponse.result )
		} );
	}

	public get self(): EndpointAddr
	{
		return this.role == InterfaceRole.Transmitter ? this.transmitter : this.receiver;
	}

	public get peer(): EndpointAddr
	{
		return this.role == InterfaceRole.Receiver ? this.transmitter : this.receiver;
	}
	
	public get interface() : string
	{
		return this.iface;
	}

	public get transmitterFromReceiver() : AvNodeTransform
	{
		return this.lastTransmitterFromReceiver;
	}

	public get selfFromPeer() : AvNodeTransform
	{
		if( this.role == InterfaceRole.Transmitter )
		{
			return this.lastTransmitterFromReceiver;
		}
		else
		{
			return invertNodeTransform( this.lastTransmitterFromReceiver );
		}
	}

	sendEvent( event: object ): Promise<void>
	{
		return new Promise<void>( async (resolve, reject ) =>
		{
			let [ msgResponse ] = await AvGadget.instance().sendMessageAndWaitForResponse<MsgInterfaceSendEventResponse>(
				MessageType.InterfaceSendEvent, 
				{
					destination: this.peer,
					peer: this.self,
					iface: this.iface,
					event
				} as MsgInterfaceSendEvent,
				MessageType.InterfaceSendEventResponse );
			resolve();
		} );
	}

	onEnded( endedCallback:() => void ): void
	{
		this.endedCallback = endedCallback;
	}

	end( transmitterFromReceiver : AvNodeTransform )
	{
		if( transmitterFromReceiver )
		{
			this.lastTransmitterFromReceiver = transmitterFromReceiver;
		}
		this.endedCallback?.();
	}

	onEvent( eventCallback:( event: object ) => void ): void
	{
		this.eventCallback = eventCallback;
	}

	event( event: object, destinationFromPeer: AvNodeTransform )
	{
		if( destinationFromPeer )
		{
			if( this.role == InterfaceRole.Transmitter )
			{
				this.lastTransmitterFromReceiver = destinationFromPeer;
			}
			else
			{
				this.lastTransmitterFromReceiver = invertNodeTransform( destinationFromPeer );
			}
		}

		this.eventCallback?.( event );
	}

	onTransformUpdated( transformCallback:( entityFromPeer: AvNodeTransform ) => void ): void
	{
		this.transformCallback = transformCallback;
	}

	transformUpdated( entityFromPeer: AvNodeTransform )
	{
		if( this.role == InterfaceRole.Transmitter )
		{
			this.lastTransmitterFromReceiver = entityFromPeer;
		}
		else
		{
			this.lastTransmitterFromReceiver = invertNodeTransform( entityFromPeer );
		}
	this.transformCallback?.( entityFromPeer );
	}
	
}


export interface InterfaceEntityProcessor
{
	( iface: ActiveInterface ): void;
}

export interface InterfaceProp
{
	iface: string;
	processor?: InterfaceEntityProcessor;
}

interface AvInterfaceEntityProps extends AvBaseNodeProps
{
	/** The address of the parent entity that will provide the transform
	 * for this node. If this is not specified, this node must be under an
	 * AvOrigin node or it will not be displayed. If the node provided via
	 * this property does not provide an AvChild node that refers to this entity
	 * or if that child is not visible, this entity will not be displayed.
	 * 
	 * @default none
	 */
	parent?: EndpointAddr;

	/** Instructs Aardvark to provide this entity with a stream of updated 
	 * transforms for any active interfaces that involve this entity.
	 * 
	 * @default false
	 */
	wantsTransforms?: boolean;

	/** The list of interfaces that this entity transmits. These can be any string of the form
	 * <interfacename>@<version>. When selecting an interface for a transmitter that is in range 
	 * of a receiver will select the first matching interface in the list, so each entity 
	 * should order its interfaces from highest to lowest priority if multiple interfaces of the 
	 * same type are available.
	 * 
	 * At most one of these interfaces will be active at a time.
	 * 
	 * @default []
	 */
	transmits?: InterfaceProp[];

	/** The list of interfaces that this entity receives. These can be any string of the form
	 * <interfacename>@<version>. When selecting an interface for a transmitter that is in range 
	 * of a receiver will select the first matching interface in the list, so each entity 
	 * should order its interfaces from highest to lowest priority if multiple interfaces of the 
	 * same type are available.
	 * 
	 * An entity could have any number of active received interfaces.
	 * @default []
	 */
	receives?: InterfaceProp[];

	/** The priority to use when breaking ties among multiple simultaneous intersections for the same entity.
	 * Higher numbers are chosen before lower numbers.
	 * 
	 * @default 0
	 */
	priority?: number;

	/** The volume to use when matching this entity with other interface entities. */
	volume: AvVolume | AvVolume[];

	/** A list of interface names and receivers that Aardvark should force this entity to 
	 * have an interface with when it is created. Each of these initial interfaces must be
	 * included in this entity's transmitter list. Both the receiver and and transmitter will
	 * receive InterfaceStarted events with the new interface. This new active interface starts
	 * locked, so the transmitter will need to unlock it if it wants to return its transmitter to
	 * a floating state.
	 * 
	 * If the endpoint address specified an initial lock does not exist, the active interface will receive 
	 * an InterfaceEnded event. This non-functional interface will still be locked, and the transmitter
	 * on this active interface will not start any new interfaces until it calls unlock.
	 * 
	 * @default []
	 */
	interfaceLocks?: InitialInterfaceLock[];

	/** Sets the constraint to apply to this node's transform before applying the
	 * parent transform. Using constraints without a parent may have unexpected results.
	 * 
	 * @default none
	 */
	constraint?: AvConstraint;
}

/** Defines one participant in the interface system */
export class AvInterfaceEntity extends AvBaseNode< AvInterfaceEntityProps, {} >
{
	private activeInterfaces: CActiveInterface[] = [];

	public buildNode()
	{
		let node = this.createNodeObject( AvNodeType.InterfaceEntity, this.m_nodeId );

		let needProcessor = false;

		node.propTransmits = [];
		for( let interfaceProp of this.props.transmits ?? [] )
		{
			node.propTransmits.push( interfaceProp.iface );
			needProcessor = needProcessor || ( interfaceProp.processor != null );
		}

		node.propReceives = [];
		for( let interfaceProp of this.props.receives ?? [] )
		{
			node.propReceives.push( interfaceProp.iface );
			needProcessor = needProcessor || ( interfaceProp.processor != null );
		}

		if( Array.isArray( this.props.volume ) )
		{
			node.propVolumes = this.props.volume;
		}
		else
		{
			node.propVolumes = [ this.props.volume ];
		}
		node.propParentAddr = this.props.parent;
		node.propConstraint = this.props.constraint;
		node.propPriority = this.props.priority;
		
		for( let interfaceLock of ( this.props.interfaceLocks ?? [] ) )
		{
			let foundIt = false;
			for( let transmitter of this.props.transmits ?? [] )
			{
				if( interfaceLock.iface == transmitter.iface )
				{
					foundIt = true;
					break;
				}				
			}
			if( !foundIt )
			{
				throw new Error( `Entity included an initial interface ${ interfaceLock.iface } but does not `
					+ `transmit that interface` );
			}
		}
		node.propInterfaceLocks = this.props.interfaceLocks;

		if( this.props.wantsTransforms )
		{
			node.flags |= ENodeFlags.NotifyOnTransformChange;
		}

		if( needProcessor )
		{
			AvGadget.instance().setInterfaceEntityProcessor( this.m_nodeId, 
				{
					started: this.onInterfaceStarted,
					ended: this.onInterfaceEnded,
					event: this.onInterfaceEvent,
					transformUpdated: this.onTransformUpdated,
				} );
		}

		return node;
	}

	private getProcessor( transmitter: EndpointAddr, receiver: EndpointAddr, iface: string ) 
		: [ InterfaceEntityProcessor, InterfaceRole ]
	{
		if( transmitter.endpointId == AvGadget.instance().getEndpointId() && 
			this.m_nodeId == transmitter.nodeId )
		{
			for( let interfaceProp of this.props.transmits )
			{
				if( interfaceProp.iface == iface )
				{
					return [ interfaceProp.processor, InterfaceRole.Transmitter ];
				}
			}
		}

		if( receiver.endpointId == AvGadget.instance().getEndpointId() && 
			this.m_nodeId == receiver.nodeId )
		{
			for( let interfaceProp of this.props.receives )
			{
				if( interfaceProp.iface == iface )
				{
					return [ interfaceProp.processor, InterfaceRole.Receiver ];
				}
			}
		}

		console.log( "getProcessor called when we weren't the transmitter or receiver" );
		return [ null, InterfaceRole.Invalid ];
	}

	@bind
	private onInterfaceStarted( transmitter: EndpointAddr, receiver: EndpointAddr, iface: string,
		transmitterFromReceiver: AvNodeTransform, params?: object  ): void
	{
		let [ processor, role ] = this.getProcessor( transmitter, receiver, iface );
		if( processor )
		{
			let newInterface = new CActiveInterface( transmitter, receiver, iface, transmitterFromReceiver, 
				role, params );
			this.activeInterfaces.push( newInterface );
			processor( newInterface );
		}
	}

	private findActiveInterface(transmitter: EndpointAddr, receiver: EndpointAddr, iface: string )
	{
		for( let i of this.activeInterfaces )
		{
			if( endpointAddrsMatch( i.transmitter, transmitter )
				&& endpointAddrsMatch( i.receiver, receiver )
				&& iface == i.iface )
			{
				return i;				
			}
		}

		return null;
	}

	private findActiveInterfaceByDest( destination: EndpointAddr, peer: EndpointAddr, iface: string )
	{
		for( let i of this.activeInterfaces )
		{
			if( endpointAddrsMatch( i.self, destination )
				&& endpointAddrsMatch( i.peer, peer )
				&& iface == i.iface )
			{
				return i;				
			}
		}

		return null;
	}

	@bind
	private onInterfaceEnded( transmitter: EndpointAddr, receiver: EndpointAddr, iface: string,
		transmitterFromReceiver: AvNodeTransform ): void
	{
		let activeInterface = this.findActiveInterface(transmitter, receiver, iface);
		if( activeInterface )
		{
			activeInterface.end( transmitterFromReceiver );

			this.activeInterfaces.splice( this.activeInterfaces.indexOf( activeInterface ), 1 );
		}
	}

	@bind
	private onInterfaceEvent( destination: EndpointAddr, peer: EndpointAddr, iface: string, data: object,
		destinationFromPeer: AvNodeTransform ): void
	{
		let activeInterface = this.findActiveInterfaceByDest(destination, peer, iface);
		if( activeInterface )
		{
			activeInterface.event( data, destinationFromPeer );
		}
	}

	@bind
	private onTransformUpdated( destination: EndpointAddr, peer: EndpointAddr, iface: string, 
		destinationFromPeer: AvNodeTransform ): void
	{
		let activeInterface = this.findActiveInterfaceByDest(destination, peer, iface);
		if( activeInterface )
		{
			activeInterface.transformUpdated( destinationFromPeer );
		}
	}
}
