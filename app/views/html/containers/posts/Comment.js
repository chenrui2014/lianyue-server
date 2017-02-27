import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import Component from '../../components/posts/Comment'
import * as MetaActions from '../../actions/meta'
import * as MessagesActions from '../../actions/messages'

function mapStateToProps(state) {
  return {
    meta: state.meta,
    token: state.token,
  }
}

function mapDispatchToProps(dispatch) {
  return Object.assign({}, bindActionCreators(MetaActions, dispatch), bindActionCreators(MessagesActions, dispatch));
}

export default connect(mapStateToProps, mapDispatchToProps)(Component)
