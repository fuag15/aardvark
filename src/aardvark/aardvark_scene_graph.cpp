#include "aardvark/aardvark_scene_graph.h"

#include <vector>
#include <set>
#include <cassert>

#include "aardvark.capnp.h"
#include <capnp/message.h>

namespace aardvark
{
	class CSceneGraphContext
	{
	public:

		EAvSceneGraphResult avStartSceneContext();
		EAvSceneGraphResult avFinishSceneContext( AvApp::Client *pApp, aardvark::CAardvarkClient *pClient );

		// Starts a node as a child of the current node
		EAvSceneGraphResult avStartNode( uint32_t id, const char *pchName, EAvSceneGraphNodeType type );
		EAvSceneGraphResult avFinishNode( );

		// 
		// These property setters modify the current node and must be called between 
		// an avStartNode and avFinishNode pair.
		//

		// valid for Origin nodes.
		EAvSceneGraphResult avSetOriginPath( const char *pchOriginPath );

		// valid for Transform nodes
		EAvSceneGraphResult avSetTranslation( float x, float y, float z );
		EAvSceneGraphResult avSetScale( float x, float y, float z );
		EAvSceneGraphResult avSetRotation(float x, float y, float z, float w );

		// valid for Model nodes
		EAvSceneGraphResult avSetModelUri( const char *pchModelUri );

		// valid for Panel nodes
		EAvSceneGraphResult avSetPanelTextureSource( const char *pchSourceName );

		AvNode::Builder & CurrentNode();
	private:
		struct NodeInProgress_t
		{
			NodeInProgress_t( capnp::Orphan< AvNode > node )
			{
				this->node = std::move( node );
			}
			NodeInProgress_t( const NodeInProgress_t & ) = delete;
			NodeInProgress_t( NodeInProgress_t && src )
			{
				node = std::move( src.node );
				children = src.children;
			}
			capnp::Orphan< AvNode > node;
			std::vector<uint32_t> children;
		};

		std::vector< NodeInProgress_t > m_vecBuilders;
		std::vector< capnp::Orphan< AvNode> > m_vecFinishedNodes;
		std::set<uint32_t> m_usedIds;
		::capnp::MallocMessageBuilder m_message;
		AvNode::Builder m_currentNodeBuilder = nullptr;
	};

	// -----------------------------------------------------------------------------------------------
	// Creating new contexts
	// -----------------------------------------------------------------------------------------------
	EAvSceneGraphResult avStartSceneContext( AvSceneContext *pContext )
	{
		CSceneGraphContext *pNewContext = new CSceneGraphContext;
		*pContext = (AvSceneContextStruct *)pNewContext;
		EAvSceneGraphResult res = pNewContext->avStartSceneContext();
		if ( res != EAvSceneGraphResult::Success )
			delete pNewContext;
		return res;
	}

	// -----------------------------------------------------------------------------------------------
	// Finishing contexts
	// -----------------------------------------------------------------------------------------------
	EAvSceneGraphResult avFinishSceneContext( AvSceneContext context, AvApp::Client *pApp, aardvark::CAardvarkClient *pClient )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( !pContext )
			return EAvSceneGraphResult::InvalidContext;
		EAvSceneGraphResult res = pContext->avFinishSceneContext( pApp, pClient );
		delete pContext;
		return res;
	}

	// ------------------------------------------------------------------------------------
	// These free functions just call through into the context
	// ------------------------------------------------------------------------------------
	EAvSceneGraphResult avStartNode( AvSceneContext context, uint32_t id, const char *pchName, EAvSceneGraphNodeType type )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avStartNode( id, pchName, type );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avFinishNode( AvSceneContext context )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avFinishNode();
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetOriginPath( AvSceneContext context, const char *pchOriginPath )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetOriginPath( pchOriginPath );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetTranslation( AvSceneContext context, float x, float y, float z )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetTranslation( x, y, z );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetScale( AvSceneContext context, float x, float y, float z )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetScale( x, y, z );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetRotation( AvSceneContext context, float x, float y, float z, float w )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetRotation( x, y, z, w );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetModelUri( AvSceneContext context, const char *pchModelUri )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetModelUri( pchModelUri );
		else
			return EAvSceneGraphResult::InvalidContext;

	}

	EAvSceneGraphResult avSetPanelTextureSource( AvSceneContext context, const char *pchSourceName )
	{
		CSceneGraphContext *pContext = (CSceneGraphContext *)context;
		if ( pContext )
			return pContext->avSetPanelTextureSource( pchSourceName );
		else
			return EAvSceneGraphResult::InvalidContext;
	}

	// -------------------------- CSceneGraphContext implementation ------------------------------------

	EAvSceneGraphResult CSceneGraphContext::avStartSceneContext()
	{
		// make a root node with the Id 0
		EAvSceneGraphResult res = avStartNode( 0, "root", EAvSceneGraphNodeType::Container );

		return res;
	}

	EAvSceneGraphResult CSceneGraphContext::avFinishSceneContext( AvApp::Client *pApp, aardvark::CAardvarkClient *pClient )
	{
		if ( m_vecBuilders.size() != 1 )
		{
			return EAvSceneGraphResult::NodeMismatch;
		}

		EAvSceneGraphResult res = avFinishNode();
		if ( res != EAvSceneGraphResult::Success )
		{
			return res;
		}


		AvNodeRoot::Builder root = m_message.initRoot<AvNodeRoot>();

		auto rootBuilder = root.initNodes( (uint32_t)m_vecFinishedNodes.size() );
		for ( uint32_t unNodeIndex = 0; unNodeIndex < m_vecFinishedNodes.size(); unNodeIndex++ )
		{
			size_t unReversedNodeIndex = m_vecFinishedNodes.size() - unNodeIndex - 1;
			rootBuilder[unNodeIndex].adoptNode( std::move( m_vecFinishedNodes[unReversedNodeIndex] ) );
		}

		auto reqUpdateSceneGraph = pApp->updateSceneGraphRequest();
		reqUpdateSceneGraph.setRoot( root );

		auto resUpdateSceneGraph = reqUpdateSceneGraph.send().wait( pClient->WaitScope() );
		if ( resUpdateSceneGraph.getSuccess() )
		{
			return EAvSceneGraphResult::RequestFailed;
		}
		{
			return EAvSceneGraphResult::Success;
		}
	}


	AvNode::Type ProtoTypeFromApiType( EAvSceneGraphNodeType apiType )
	{
		switch ( apiType )
		{
		case EAvSceneGraphNodeType::Container: return AvNode::Type::CONTAINER;
		case EAvSceneGraphNodeType::Origin: return AvNode::Type::ORIGIN;
		case EAvSceneGraphNodeType::Transform: return AvNode::Type::TRANSFORM;
		case EAvSceneGraphNodeType::Model: return AvNode::Type::MODEL;
		case EAvSceneGraphNodeType::Panel: return AvNode::Type::PANEL;

		default: return AvNode::Type::INVALID;
		}
	}

	EAvSceneGraphResult CSceneGraphContext::avStartNode( uint32_t id, const char *pchName, EAvSceneGraphNodeType type )
	{
		if ( m_usedIds.find( id ) != m_usedIds.end() )
		{
			return EAvSceneGraphResult::IdInUse;
		}

		NodeInProgress_t nodeInProgress( m_message.getOrphanage().newOrphan<AvNode>() );

		AvNode::Builder newNode = nodeInProgress.node.get();
		newNode.setId( id );
		auto protoType = ProtoTypeFromApiType( type );
		if ( protoType == AvNode::Type::INVALID )
		{
			return EAvSceneGraphResult::InvalidParameter;
		}

		newNode.setType( protoType );
		if ( pchName )
		{
			newNode.setName( pchName );
		}

		if ( !m_vecBuilders.empty() )
		{
			m_vecBuilders.back().children.push_back( id );
		}

		m_vecBuilders.push_back( std::move( nodeInProgress ) );
		m_currentNodeBuilder = newNode;

		m_usedIds.insert( id );
		return EAvSceneGraphResult::Success;
	}

	EAvSceneGraphResult CSceneGraphContext::avFinishNode()
	{
		assert( !m_vecBuilders.empty() );
		
		NodeInProgress_t &nip = m_vecBuilders.back();

		if ( !nip.children.empty() )
		{
			auto childrenBuilder = CurrentNode().initChildren( (uint32_t)nip.children.size() );
			for ( uint32_t unIndex = 0; unIndex < nip.children.size(); unIndex++ )
			{
				childrenBuilder.set( unIndex, nip.children[unIndex] );
			}
		}

		m_vecFinishedNodes.push_back( std::move( nip.node ) );
		m_vecBuilders.pop_back();

		if ( m_vecBuilders.empty() )
		{
			m_currentNodeBuilder = nullptr;
		}
		else
		{
			m_currentNodeBuilder = m_vecBuilders.back().node.get();
		}

		return EAvSceneGraphResult::Success;
	}

	// 
	// These property setters modify the current node and must be called between 
	// an avStartNode and avFinishNode pair.
	//

	// valid for Origin nodes.
	EAvSceneGraphResult CSceneGraphContext::avSetOriginPath( const char *pchOriginPath )
	{
		if ( CurrentNode().getType() != AvNode::Type::ORIGIN )
			return EAvSceneGraphResult::InvalidNodeType;
		CurrentNode().setPropOrigin( pchOriginPath );
		return EAvSceneGraphResult::Success;
	}

	// valid for Transform nodes
	EAvSceneGraphResult CSceneGraphContext::avSetTranslation( float x, float y, float z )
	{
		if ( CurrentNode().getType() != AvNode::Type::TRANSFORM )
			return EAvSceneGraphResult::InvalidNodeType;
		AvVector::Builder & trans = CurrentNode().getPropTransform().getPosition();
		trans.setX( x );
		trans.setY( y );
		trans.setZ( z );
		return EAvSceneGraphResult::Success;
	}
	EAvSceneGraphResult CSceneGraphContext::avSetScale( float x, float y, float z )
	{
		if ( CurrentNode().getType() != AvNode::Type::TRANSFORM )
			return EAvSceneGraphResult::InvalidNodeType;
		AvVector::Builder & scale = CurrentNode().getPropTransform().getScale();
		scale.setX( x );
		scale.setY( y );
		scale.setZ( z );
		return EAvSceneGraphResult::Success;
	}
	EAvSceneGraphResult CSceneGraphContext::avSetRotation( float x, float y, float z, float w )
	{
		if ( CurrentNode().getType() != AvNode::Type::TRANSFORM )
			return EAvSceneGraphResult::InvalidNodeType;
		AvQuaternion::Builder & rot = CurrentNode().getPropTransform().getRotation();
		rot.setX( x );
		rot.setY( y );
		rot.setZ( z );
		rot.setW( w );
		return EAvSceneGraphResult::Success;
	}

	// valid for Model nodes
	EAvSceneGraphResult CSceneGraphContext::avSetModelUri( const char *pchModelUri )
	{
		if ( CurrentNode().getType() != AvNode::Type::MODEL )
			return EAvSceneGraphResult::InvalidNodeType;
		CurrentNode().setPropModelUri( pchModelUri );
		return EAvSceneGraphResult::Success;
	}

	EAvSceneGraphResult CSceneGraphContext::avSetPanelTextureSource( const char *pchTextureSource )
	{
		if ( CurrentNode().getType() != AvNode::Type::PANEL )
			return EAvSceneGraphResult::InvalidNodeType;
		CurrentNode().setPropTextureSource( pchTextureSource );
		return EAvSceneGraphResult::Success;
	}

	AvNode::Builder & CSceneGraphContext::CurrentNode()
	{
		return m_currentNodeBuilder;
	}

	// tells the renderer what DXGI to use for a scene graph node
	EAvSceneGraphResult avUpdateDxgiTextureForApps( aardvark::CAardvarkClient *pClient, const char **pchAppName, uint32_t unNameCount, void *pvSharedTextureHandle )
	{
		auto reqUpdate = pClient->Server().updateDxgiTextureForAppsRequest();
		if ( unNameCount )
		{
			auto names = reqUpdate.initAppNames( unNameCount );
			for ( uint32_t n = 0; n < unNameCount; n++ )
			{
				names.set( n, pchAppName[n] );
			}
		}
		reqUpdate.setSharedTextureHandle( reinterpret_cast<uint64_t>( pvSharedTextureHandle ) );
		auto promUpdate = reqUpdate.send()
		.then( []( AvServer::UpdateDxgiTextureForAppsResults::Reader && result )
		{
			// nothing to do when the update happens
		} );
		pClient->addToTasks( std::move( promUpdate ) );
		return EAvSceneGraphResult::Success;
	}

}